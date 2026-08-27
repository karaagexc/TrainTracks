import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';
import ts from 'typescript';

const cwd = process.cwd();
const originalResolve = Module._resolveFilename;

Module._resolveFilename = function resolveAlias(request, parent, isMain, options) {
    if (request === 'server-only') {
        return path.join(cwd, 'node_modules', 'next', 'dist', 'compiled', 'server-only', 'empty.js');
    }
    if (request.startsWith('@/')) {
        return originalResolve.call(this, path.join(cwd, 'src', request.slice(2)), parent, isMain, options);
    }
    return originalResolve.call(this, request, parent, isMain, options);
};

function transpileTypeScript(module, filename) {
    const source = fs.readFileSync(filename, 'utf8');
    const output = ts.transpileModule(source, {
        compilerOptions: {
            esModuleInterop: true,
            jsx: ts.JsxEmit.React,
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2019,
        },
    }).outputText;

    module._compile(output, filename);
}

Module._extensions['.ts'] = transpileTypeScript;
Module._extensions['.tsx'] = transpileTypeScript;

const require = Module.createRequire(import.meta.url);
const {
    INCIDENT_CHANNEL,
    INCIDENT_CONFIG,
    listActiveIncidents,
    recordIncidentReport,
    resetIncidentAggregatorForTests,
    sweepExpiredIncidents,
    voteIncidentResolved,
} = require('../src/domain/crowd/incidentAggregator.ts');
const { broadcastIncidentEvent } = require('../src/domain/crowd/incidentBroadcast.ts');
const {
    hashStallDeviceId,
    resetStallReportRateLimitsForTests,
    sanitizeStallReportPayload,
} = require('../src/domain/crowd/stallReport.ts');
const { verifyPredictionApiAccess } = require('../src/domain/predictions/apiAccess.ts');

const baseNow = Date.parse('2026-06-01T10:00:00+08:00');

function resetAll() {
    resetIncidentAggregatorForTests();
    resetStallReportRateLimitsForTests();
}

function reportFor(deviceId, overrides = {}, now = baseNow) {
    const result = sanitizeStallReportPayload({
        deviceId,
        lineId: 'LRT1',
        lat: 14.538825,
        lng: 121.000683333,
        severity: 'confirmed_traffic',
        reason: 'slow_traffic',
        stallDurationMin: 7,
        ...overrides,
    }, now);
    assert.equal(result.ok, true, result.message);
    return result.report;
}

resetAll();
const messageReport = reportFor('message-device-001', {
    message: '<b>Door stuck</b>\nPlease check this incredibly long note '.repeat(8),
});
assert.equal(messageReport.reason, 'slow_traffic', 'stall report should preserve valid reason');
assert.ok(messageReport.message.length <= 200, 'stall report message should be clamped to 200 chars');
assert.equal(messageReport.message.includes('<'), false, 'stall report message should strip angle brackets');

const rateLimited = sanitizeStallReportPayload({
    deviceId: 'message-device-001',
    lineId: 'LRT1',
    lat: 14.538825,
    lng: 121.000683333,
    severity: 'confirmed_traffic',
    reason: 'slow_traffic',
    stallDurationMin: 7,
}, baseNow + 1000);
assert.equal(rateLimited.code, 'rate_limited', 'rate limit should still apply per hashed device');

assert.equal(sanitizeStallReportPayload({
    deviceId: 'reject-mrt7-001',
    lineId: 'MRT7',
    lat: 14.65531459,
    lng: 121.030974133,
    severity: 'confirmed_traffic',
    stallDurationMin: 7,
}, baseNow).code, 'invalid_line', 'MRT-7 stall reports must be rejected');

assert.equal(sanitizeStallReportPayload({
    deviceId: 'reject-bounds-001',
    lineId: 'LRT1',
    lat: 0,
    lng: 0,
    severity: 'confirmed_traffic',
    stallDurationMin: 7,
}, baseNow).code, 'invalid_location', 'out-of-bounds stall reports must be rejected');

resetAll();
let first = recordIncidentReport(reportFor('quorum-device-001', {}, baseNow));
let second = recordIncidentReport(reportFor('quorum-device-002', {}, baseNow + 60_000));
let third = recordIncidentReport(reportFor('quorum-device-003', {}, baseNow + 120_000));
assert.equal(first.event, null, 'first report should remain pending');
assert.equal(second.event, null, 'second unique report should remain pending');
assert.equal(third.event?.event, 'incident_confirmed', 'third unique report should confirm incident');
assert.equal(third.incident.uniqueDeviceCount, 3);
assert.equal(listActiveIncidents({ now: baseNow + 121_000 }).length, 1, 'confirmed incident should be listed');

const updated = recordIncidentReport(reportFor('quorum-device-004', {
    severity: 'confirmed_emergency',
    reason: 'full_stop',
}, baseNow + 180_000), baseNow + 180_000);
assert.equal(updated.event?.event, 'incident_updated', 'fresh report on confirmed incident should broadcast update');
assert.equal(updated.incident.severity, 'emergency', 'incident severity should upgrade to emergency');
assert.equal(updated.incident.reportCount, 4, 'incident report count should refresh');

resetAll();
const duplicateBase = reportFor('dupe-device-001', {}, baseNow);
assert.equal(recordIncidentReport(duplicateBase).event, null);
assert.equal(recordIncidentReport({
    ...duplicateBase,
    id: `${duplicateBase.id}-dupe`,
    reportedAt: baseNow + 60_000,
}).event, null);
assert.equal(recordIncidentReport(reportFor('dupe-device-002', {}, baseNow + 120_000)).event, null);
assert.equal(listActiveIncidents({ now: baseNow + 121_000 }).length, 0, 'duplicate device reports should not count toward quorum');

resetAll();
recordIncidentReport(reportFor('ttl-device-001', {}, baseNow));
recordIncidentReport(reportFor('ttl-device-002', {}, baseNow + 60_000));
third = recordIncidentReport(reportFor('ttl-device-003', {}, baseNow + 120_000));
assert.equal(third.event?.event, 'incident_confirmed');
const expiredEvents = sweepExpiredIncidents(baseNow + 120_000 + INCIDENT_CONFIG.ttlMs + 1);
assert.equal(expiredEvents[0]?.event, 'incident_resolved', 'stale confirmed incidents should auto-resolve');
assert.equal(expiredEvents[0]?.incident.resolvedBy, 'auto_expired');
assert.equal(listActiveIncidents({ now: baseNow + 120_000 + INCIDENT_CONFIG.ttlMs + 2 }).length, 0);

resetAll();
recordIncidentReport(reportFor('resolve-device-001', {}, baseNow));
recordIncidentReport(reportFor('resolve-device-002', {}, baseNow + 60_000));
const confirmed = recordIncidentReport(reportFor('resolve-device-003', {}, baseNow + 120_000));
const incidentId = confirmed.incident.id;
assert.equal(voteIncidentResolved(incidentId, hashStallDeviceId('resolve-voter-001'), baseNow + 130_000).incident.resolveVoteCount, 1);
assert.equal(voteIncidentResolved(incidentId, hashStallDeviceId('resolve-voter-002'), baseNow + 131_000).incident.resolveVoteCount, 2);
const resolved = voteIncidentResolved(incidentId, hashStallDeviceId('resolve-voter-003'), baseNow + 132_000);
assert.equal(resolved.event?.event, 'incident_resolved', 'third resolve vote should resolve incident');
assert.equal(resolved.incident.resolvedBy, 'user_vote');

const broadcastCalls = [];
const broadcast = await broadcastIncidentEvent(confirmed.event, {
    env: {
        NEXT_PUBLIC_SUPABASE_URL: 'https://traintracks.supabase.co/',
        SUPABASE_SERVICE_ROLE_KEY: 'service-secret',
    },
    fetchImpl: async (url, init) => {
        broadcastCalls.push({ url, init });
        return new Response('{}', { status: 202 });
    },
});
assert.equal(broadcast.ok, true, 'incident broadcast should accept successful Supabase REST responses');
const body = JSON.parse(broadcastCalls[0].init.body);
assert.equal(body.messages[0].topic, INCIDENT_CHANNEL);
assert.equal(body.messages[0].event, 'incident_confirmed');
assert.equal(body.messages[0].payload.incident.id, incidentId);

assert.equal(
    (await verifyPredictionApiAccess({
        headers: new Headers(),
        url: new URL('https://traintracks.test/api/public/incidents?key=secret-token'),
        env: { TRAINTRACKS_PUBLIC_API_TOKENS: 'secret-token' },
    })).status,
    401,
    'public API token parser should reject query-string credentials',
);

console.log('Incident smoke checks passed');
