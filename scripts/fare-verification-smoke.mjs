import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';

// Independent of the journey harness and backend: compare every directed fare
// with the separately transcribed operator fixture, never with its reverse.
const require = Module.createRequire(import.meta.url);
const oldExtension = Module._extensions['.ts'];
const oldResolve = Module._resolveFilename;
Module._resolveFilename = function resolveAlias(request, parent, isMain, options) {
    return oldResolve.call(this, request.startsWith('@/') ? path.resolve('src', request.slice(2)) : request, parent, isMain, options);
};
Module._extensions['.ts'] = (module, filename) => {
    module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText, filename);
};
const { FARE_MATRIX } = require('../src/data/fareMatrix.ts');
const { getEffectiveFare, CURRENT_RAIL_FARE_POLICY, RAIL_FARE_VERIFICATION_GAPS } = require('../src/data/farePolicy.ts');
const { STATIONS } = require('../src/data/stations.ts');
Module._resolveFilename = oldResolve;
if (oldExtension) Module._extensions['.ts'] = oldExtension;
else delete Module._extensions['.ts'];

const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/official-rail-fares-2026.json', import.meta.url), 'utf8'));
const byId = Object.fromEntries(STATIONS.map(station => [station.id, station]));
const effectiveAt = Date.parse('2026-10-09T04:00:00.000Z');
const boundary = Date.parse(CURRENT_RAIL_FARE_POLICY.effectiveFrom);
const ids = new Set();
let directedPairs = 0;
let verifiedBaseCells = 0;
let verifiedEffectiveCells = 0;
let unverifiedCells = 0;

function rows(table, key, size) {
    const result = typeof table[key] === 'string' ? table[table[key]] : table[key];
    if (result === null) return null;
    assert.equal(result.length, size, `${key}: every origin is present`);
    for (const row of result) {
        assert.equal(row.length, size, `${key}: every destination is present`);
        assert.ok(row.every(value => Number.isFinite(value) && value >= 0));
    }
    return result;
}

for (const [lineId, line] of Object.entries(fixture.lines)) {
    assert.equal(new Set(line.stationIds).size, line.stationIds.length);
    assert.equal(line.stationNames.length, line.stationIds.length);
    const base = Object.fromEntries(['SJT', 'BEEP', 'CONCESSION'].map(key => [key, rows(line, key, line.stationIds.length)]));
    const current = line.current && {
        SJT: rows(line.current, 'SJT', line.stationIds.length),
        SVC: rows(line.current, 'SVC', line.stationIds.length),
    };
    for (const id of line.stationIds) {
        assert.equal(byId[id]?.lineId, lineId, `${id}: real catalog ID belongs to this line`);
        assert.ok(!ids.has(id), `${id}: no ID reused by another line`);
        ids.add(id);
        assert.equal(Object.keys(FARE_MATRIX[id]).length, line.stationIds.length - 1);
    }
    for (let i = 0; i < line.stationIds.length; i++) for (let j = 0; j < line.stationIds.length; j++) {
        if (i === j) continue;
        const from = line.stationIds[i];
        const to = line.stationIds[j];
        const entry = FARE_MATRIX[from]?.[to];
        assert.ok(entry, `${from}->${to}: directed entry exists`);
        directedPairs += 1;
        for (const ticket of ['SJT', 'SVC', 'CONCESSION']) {
            const key = ticket === 'SVC' ? 'BEEP' : ticket;
            const expectedBase = base[key]?.[i][j];
            const effective = getEffectiveFare(lineId, ticket, entry, effectiveAt);
            assert.ok(Number.isFinite(effective.amount) && effective.amount >= 0);
            if (expectedBase === undefined) {
                assert.equal(lineId, 'LRT1');
                assert.equal(ticket, 'CONCESSION');
                assert.equal(effective.amount, entry.CONCESSION, 'no invented replacement for an unverified fare');
                assert.equal(effective.verification, 'unverified');
                assert.equal(effective.verificationNote, RAIL_FARE_VERIFICATION_GAPS.LRT1);
                unverifiedCells += 1;
                continue;
            }
            assert.equal(entry[key], expectedBase, `${from}->${to} ${ticket}: operator base cell`);
            verifiedBaseCells += 1;
            const beforeRelief = getEffectiveFare(lineId, ticket, entry, boundary - 1);
            assert.equal(beforeRelief.amount, expectedBase);
            assert.equal(beforeRelief.policy, null);
            const medium = ticket === 'CONCESSION' ? line.current?.concessionMedium : ticket;
            const expectedEffective = current ? current[medium][i][j] : expectedBase;
            assert.equal(effective.amount, expectedEffective, `${from}->${to} ${ticket}: operator charged cell`);
            assert.equal(effective.verification, 'verified');
            assert.equal(effective.verificationNote, null);
            assert.equal(getEffectiveFare(lineId, ticket, entry, boundary).amount, expectedEffective, 'Manila March 23 boundary');
            if (current) {
                assert.equal(effective.policy.id, CURRENT_RAIL_FARE_POLICY.id);
                assert.equal(effective.baseAmount, ticket === 'SJT' ? entry.SJT : entry.BEEP);
            }
            verifiedEffectiveCells += 1;
        }
    }
}
assert.equal(ids.size, 51);
assert.equal(directedPairs, 912);
assert.equal(verifiedBaseCells, 2136);
assert.equal(verifiedEffectiveCells, 2136);
assert.equal(unverifiedCells, 600, 'unverified is a reported gap, not a fabricated passing cell');
assert.equal(fixture.lines.LRT1.stationIds[0], 'L1-25', 'Dr. Santos is not the FPJ ID');
assert.equal(fixture.lines.LRT1.stationIds.at(-1), 'L1-20');
assert.equal(FARE_MATRIX['L1-25']['L1-24'].BEEP, 19);
assert.equal(FARE_MATRIX['L1-24']['L1-25'].BEEP, 19);
assert.equal(FARE_MATRIX['L1-20']['L1-19'].BEEP, 19);
for (const ticket of ['SJT', 'SVC', 'CONCESSION']) {
    assert.equal(getEffectiveFare('MRT3', ticket, FARE_MATRIX['M3-01']['M3-02'], effectiveAt).amount, 6);
}
assert.equal(getEffectiveFare('LRT2', 'CONCESSION', FARE_MATRIX['L2-01']['L2-02'], effectiveAt).amount, 7.5);
const unknownBand = getEffectiveFare('MRT3', 'SJT', { SJT: 15, BEEP: 15, CONCESSION: 7 }, effectiveAt);
assert.equal(unknownBand.verification, 'unverified');
assert.equal(unknownBand.amount, 15, 'a new band must not invent a discounted rounding rule');
assert.equal(getEffectiveFare('LRT2', 'SJT', FARE_MATRIX['L2-01']['L2-02'], NaN).policy, null);
assert.equal(getEffectiveFare('EDSA', 'CONCESSION', { SJT: 20, BEEP: 16, CONCESSION: 13 }, effectiveAt).paymentMedium, 'stored_value');

const { reconcile, readMatrix } = require('./add_concession_fares.js');
const mutation = structuredClone(FARE_MATRIX);
mutation['L1-25']['L1-24'].BEEP = 999;
mutation['L1-25']['L1-24'].CONCESSION = 12345;
mutation['M3-01']['M3-02'].CONCESSION = 999;
mutation['BUS-FIXTURE'] = { 'BUS-DEST': { SJT: 30, BEEP: 30, CONCESSION: 24 } };
const repaired = reconcile(mutation);
assert.equal(repaired.repaired['L1-25']['L1-24'].BEEP, 19);
assert.equal(repaired.repaired['L1-25']['L1-24'].CONCESSION, 12345, 'unverified cells never get a fallback');
assert.equal(repaired.repaired['M3-01']['M3-02'].CONCESSION, 6);
assert.deepEqual(repaired.repaired['BUS-FIXTURE'], mutation['BUS-FIXTURE']);
assert.equal(repaired.unknown.length, 600);
assert.equal(reconcile(FARE_MATRIX).changes.length, 0);
assert.throws(() => readMatrix('export const FARE_MATRIX = runArbitraryCode();'), /literal/);

const matrixPath = path.resolve('src/data/fareMatrix.ts');
const hash = () => createHash('sha256').update(fs.readFileSync(matrixPath)).digest('hex');
const before = hash();
const command = spawnSync(process.execPath, ['scripts/add_concession_fares.js'], { encoding: 'utf8' });
assert.equal(command.status, 0, command.stderr);
assert.equal(hash(), before, 'legacy script is read-only');
assert.equal(JSON.parse(command.stdout).unresolvedCells, 600);
const noPatch = spawnSync(process.execPath, ['scripts/add_concession_fares.js', '--patch'], { encoding: 'utf8' });
assert.equal(noPatch.status, 0);
assert.equal(noPatch.stdout, '', 'idempotent reconciliation emits no empty or malformed patch');
assert.equal(hash(), before);
console.log(JSON.stringify({ directedPairs, verifiedBaseCells, verifiedEffectiveCells, unverifiedLrt1ConcessionCells: unverifiedCells, backendCalls: 0 }));
