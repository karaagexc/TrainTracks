import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';
import ts from 'typescript';

// Actual modules, isolated in-memory adapters. Never reads credentials or calls a backend.
const cwd = process.cwd();
const originalResolve = Module._resolveFilename;
const originalLoad = Module._load;
const require = Module.createRequire(import.meta.url);
let user = { id: 'fixture-owner', email: 'fixture@example.invalid', created_at: '2026-01-01T00:00:00Z', app_metadata: { provider: 'email' } };
let authError = null;
let isAdmin = true;
let schemaMissing = false;
let databaseError = null;
let exchangeResult = { data: { session: { user } }, error: null };
let exchanges = 0;
let authCallback;
let synchronizedOwner = null;
const queries = [];
const rows = { trip_history: [], profiles: [], profile_private: [], user_roles: [], api_tokens: [], app_config: [] };

function query(table) {
    const state = { table, operation: 'select', filters: [], columns: '*', orders: [] };
    const builder = {
        select(columns) { state.columns = columns; return this; },
        eq(key, value) { state.filters.push([key, value]); return this; },
        order(key, options) { state.orders.push([key, options]); return this; },
        range(start, end) { state.range = [start, end]; return this; },
        limit(limit) { state.range = [0, limit - 1]; return this; },
        single() { state.single = true; return this; },
        maybeSingle() { state.single = true; return this; },
        upsert(payload, options = {}) { state.operation = 'upsert'; state.payload = payload; state.options = options; return this; },
        insert(payload) { state.operation = 'insert'; state.payload = payload; return this; },
        update(payload) { state.operation = 'update'; state.payload = payload; return this; },
        delete() { state.operation = 'delete'; return this; },
        then(resolve, reject) { return Promise.resolve().then(() => execute(state)).then(resolve, reject); },
    };
    return builder;
}

function execute(state) {
    queries.push(structuredClone(state));
    if (databaseError) return { data: null, error: { message: databaseError } };
    if (state.table === 'app_config' && schemaMissing && state.columns.includes('api_config')) {
        return { data: null, error: { code: '42703', message: 'column app_config.congestion_config does not exist' } };
    }
    const table = rows[state.table];
    let selected = table.filter(row => state.filters.every(([key, value]) => row[key] === value));
    if (state.operation === 'upsert' || state.operation === 'insert') {
        if (state.table === 'profiles' && 'updated_at' in state.payload) return { data: null, error: { message: 'INSERT(updated_at) denied' } };
        const duplicate = state.operation === 'upsert' && table.find(row => state.table === 'trip_history'
            ? row.user_id === state.payload.user_id && row.client_trip_id === state.payload.client_trip_id
            : row.user_id === state.payload.user_id);
        if (duplicate && state.options.ignoreDuplicates) selected = [];
        else if (duplicate) { Object.assign(duplicate, state.payload); selected = [duplicate]; }
        else {
            const row = { id: `fixture-${table.length + 1}`, ...state.payload, updated_at: '2026-10-09T00:00:00Z' };
            table.push(row);
            selected = [row];
        }
    }
    if (state.operation === 'update') {
        assert.equal('updated_at' in state.payload, false, 'server-managed timestamp must not be sent');
        if (state.table === 'profiles') assert.equal('id' in state.payload, false, 'UPDATE(id) is not granted');
        selected.forEach(row => Object.assign(row, state.payload));
    }
    if (state.operation === 'delete') selected.forEach(row => table.splice(table.indexOf(row), 1));
    for (const [key, options] of state.orders.slice().reverse()) selected.sort((a, b) => String(a[key]).localeCompare(String(b[key])) * (options.ascending ? 1 : -1));
    if (state.range) selected = selected.slice(state.range[0], state.range[1] + 1);
    return { data: state.single ? selected[0] ?? null : selected, error: null, count: selected.length };
}

const client = {
    from: query,
    rpc: async name => name === 'current_user_is_admin'
        ? { data: isAdmin, error: databaseError ? { message: databaseError } : null }
        : { data: [{ total_trips: rows.trip_history.filter(row => row.user_id === user?.id).length,
            total_fare: rows.trip_history.filter(row => row.user_id === user?.id).reduce((sum, row) => sum + row.fare, 0),
            total_distance: rows.trip_history.filter(row => row.user_id === user?.id).reduce((sum, row) => sum + row.distance_km, 0) }],
            error: databaseError ? { message: databaseError } : null },
    auth: {
        getUser: async () => ({ data: { user }, error: authError }),
        getSession: async () => ({ data: { session: user ? { user } : null }, error: authError }),
        onAuthStateChange: callback => { authCallback = callback; return { data: { subscription: { unsubscribe() {} } } }; },
        signOut: async () => ({ error: authError }),
        exchangeCodeForSession: async () => { exchanges++; return exchangeResult; },
    },
};

Module._resolveFilename = function(request, parent, isMain, options) {
    if (request === 'server-only') return path.join(cwd, 'node_modules/next/dist/compiled/server-only/empty.js');
    if (request.startsWith('@/')) return originalResolve.call(this, path.join(cwd, 'src', request.slice(2)), parent, isMain, options);
    return originalResolve.call(this, request, parent, isMain, options);
};
Module._load = function(request, parent, isMain) {
    if (['@/lib/supabase/server', '@/lib/supabase/client'].includes(request)) return { createClient: asyncOrSyncClient(request) };
    if (request === '@/lib/supabase/admin') return { createAdminClient: () => client, hasAdminSupabaseConfig: () => true };
    return originalLoad.call(this, request, parent, isMain);
};
function asyncOrSyncClient(request) { return request.endsWith('/server') ? async () => client : () => client; }
function transpile(module, filename) {
    module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
        compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText, filename);
}
Module._extensions['.ts'] = transpile;
Module._extensions['.tsx'] = transpile;

const { NextRequest } = require('next/server');
const trips = require('../src/app/api/trips/route.ts');
const adminConfig = require('../src/app/api/admin/config/route.ts');
const tokenRoutes = require('../src/app/api/admin/api-tokens/route.ts');
const tokenEditRoutes = require('../src/app/api/admin/api-tokens/[id]/route.ts');
const config = require('../src/domain/config/index.ts');
const consoleConfig = require('../src/domain/config/console.ts');
const redirect = require('../src/domain/auth/redirect.ts');
const profile = require('../src/domain/auth/profile.ts');
const authAdmin = require('../src/app/api/auth/admin/route.ts');
const callback = require('../src/app/auth/callback/route.ts');
const validTrip = {
    client_trip_id: 'isolated-trip-1', origin_id: 'L1-20', origin_name: 'FPJ', destination_id: 'L1-19', destination_name: 'Balintawak',
    line_id: 'LRT1', ticket_type: 'SJT', fare: 20, distance_km: 1, direction: 'SOUTHBOUND', duration_minutes: 10,
    started_at: '2026-10-08T10:00:00+08:00', completed_at: '2026-10-08T10:10:00+08:00',
};
const request = (method, body, pathname = '/api/trips', extraHeaders = {}) => new NextRequest(`http://localhost:3000${pathname}`, {
    method, headers: { 'Content-Type': 'application/json', ...extraHeaders }, ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
});
const check = async (response, status) => { assert.equal(response.status, status); return response.json(); };
const resetQueries = () => { queries.length = 0; };

const first = await check(await trips.POST(request('POST', validTrip)), 201);
assert.equal(first.trip.completed_at, '2026-10-08T02:10:00.000Z');
assert.equal(first.trip.user_id, user.id);
assert.equal(queries.find(q => q.operation === 'upsert').options.ignoreDuplicates, true);
const retry = await check(await trips.POST(request('POST', { ...validTrip, completed_at: '2026-10-08T11:00:00+08:00', fare: 30 })), 201);
assert.equal(retry.trip.completed_at, first.trip.completed_at);
assert.equal(retry.trip.fare, 20);
assert.equal(rows.trip_history.length, 1);
const derived = await check(await trips.POST(request('POST', { ...validTrip, client_trip_id: 'derived', completed_at: undefined })), 201);
assert.equal(derived.trip.completed_at, first.trip.completed_at);
const noDuration = await check(await trips.POST(request('POST', { ...validTrip, client_trip_id: 'no-duration', duration_minutes: null, completed_at: undefined })), 201);
assert.ok(Number.isFinite(Date.parse(noDuration.trip.completed_at)));

for (const edit of [
    { origin_id: 'fake' }, { line_id: 'MRT7' }, { ticket_type: 'BUS_REGULAR' }, { started_at: 'invalid' },
    { started_at: '2026-02-30T10:00:00Z' }, { started_at: '2026-10-08T25:00:00Z' }, { started_at: '2099-01-01T00:00:00Z' },
    { fare: null }, { distance_km: null }, { fare: -1 }, { fare: 10001 }, { distance_km: 501 },
    { fare: 'Infinity' }, { distance_km: '' }, { duration_minutes: 2.5 }, { direction: 'EASTBOUND' },
    { destination_line_id: 'LRT2' }, { user_id: 'another-account' }, { completed_at: null },
    { completed_at: '2026-10-08T09:00:00+08:00' },
]) {
    resetQueries();
    await check(await trips.POST(request('POST', { ...validTrip, ...edit })), 400);
    assert.equal(queries.length, 0, 'invalid POST must not reach storage');
}
for (const body of ['{', null, []]) await check(await trips.POST(request('POST', body)), 400);
for (const patch of [{ fare: null }, { distance_km: null }, { fare: -1 }, { distance_km: 'NaN' }, { direction: 'bad' }, { completed_at: first.trip.completed_at }, {}, []]) {
    resetQueries();
    await check(await trips.PATCH(request('PATCH', { id: first.trip.id, patch })), 400);
    assert.equal(queries.length, 0);
}
await check(await trips.PATCH(request('PATCH', { id: 'missing', patch: { fare: 5 } })), 404);
await check(await trips.PATCH(request('PATCH', { id: first.trip.id, patch: { fare: 0, distance_km: 0 } })), 200);
await check(await trips.PATCH(request('PATCH', { id: first.trip.id, patch: { direction: 'EASTBOUND' } })), 400);
await check(await trips.PATCH(request('PATCH', { id: first.trip.id, patch: { direction: 'NORTHBOUND' } })), 200);
resetQueries();
const recent = await check(await trips.GET(request('GET')), 200);
assert.equal(recent.trips.length, 3);
assert.deepEqual(queries[0].range, [0, 2], 'default history limit is three');
for (let i = 0; i < 4; i++) rows.trip_history.push({ ...first.trip, id: `more-${i}`, client_trip_id: `more-${i}`, fare: 10 });
rows.trip_history.push({ ...first.trip, id: 'other-owner', user_id: 'another-account', fare: 10000 });
const page = await check(await trips.GET(request('GET', undefined, '/api/trips?limit=2&offset=1&includeTotals=true')), 200);
assert.equal(page.trips.length, 2);
assert.deepEqual(page.pagination, { limit: 2, offset: 1, hasMore: true, nextOffset: 3 });
assert.equal(page.totals.totalTrips, 7);
assert.ok(page.totals.totalFare < 10000, 'totals must exclude other owners');
for (const params of ['limit=', 'limit=0', 'limit=1.5', 'limit=101', 'offset=-1', 'limit=NaN']) await check(await trips.GET(request('GET', undefined, `/api/trips?${params}`)), 400);
databaseError = 'database unavailable';
await check(await trips.GET(request('GET')), 500);
databaseError = null;
await check(await trips.POST(request('POST', validTrip, '/api/trips', { Origin: 'https://hostile.invalid' })), 403);

rows.app_config = [{ id: 1, maintenance_mode: true, maintenance_message: 'fixture maintenance', congestion_config: {},
    api_config: structuredClone(config.API_CONFIG_DEFAULTS), public_api_enabled: true, updated_at: '2026-10-09T00:00:00Z' }];
assert.equal(config.validateApiConfig(config.API_CONFIG_DEFAULTS).ok, true);
for (const [group, field, value] of [['prediction', 'defaultLimit', null], ['prediction', 'defaultLimit', 2.5], ['crowd', 'intervalMs', 2999],
    ['crowd', 'requiredSamples', 1], ['stall', 'deviceCooldownMs', 299999], ['stall', 'maxReportsPerHour', 7], ['stall', 'maxStationDistKm', 1.6], ['stall', 'minDurationMin', 2]]) {
    const candidate = structuredClone(config.API_CONFIG_DEFAULTS);
    candidate[group][field] = value;
    assert.equal(config.validateApiConfig(candidate).ok, false, `${group}.${field} safety bound`);
}
for (const origin of ['https://example.invalid/path', 'https://user:pass@example.invalid', 'null', 'javascript:alert(1)', 'https://*.vercel.app']) {
    assert.equal(config.validateApiConfig({ ...config.API_CONFIG_DEFAULTS, corsOrigin: origin }).ok, false);
}
const consoleValues = consoleConfig.configToConsoleValues();
assert.equal(consoleConfig.configFromConsoleValues(consoleValues, config.API_CONFIG_DEFAULTS).ok, true);
assert.equal(consoleConfig.configFromConsoleValues({ crowdIntervalMs: '1' }, config.API_CONFIG_DEFAULTS).ok, false);
assert.equal(consoleConfig.configFromConsoleValues({ defaultLimit: '' }, config.API_CONFIG_DEFAULTS).ok, false);
assert.equal(config.validateCongestionConfig({ calendar: [{ date: '2026-02-30' }] }).ok, false);
assert.equal(config.validateCongestionConfig({ calendar: [{ multiplier: null }] }).ok, false);
assert.equal(config.validateCongestionConfig({ calendar: [{ multiplier: NaN }] }).ok, false);
assert.equal(config.validateCongestionConfig({ calendar: [{ mode: 'holiday', date: '2026-10-09', multiplier: 1.2 }] }).ok, true);
assert.equal(config.validateCongestionConfig({ calendar: [{ date: '02-29' }] }).ok, true, 'existing annual calendar dates remain supported');
for (const body of ['{', {}, [], null, { maintenanceMode: 'true' }, { apiConfig: {} }, { congestionConfig: [] }, { unknown: 1 }, { publicApiEnabled: null }]) {
    resetQueries();
    await check(await adminConfig.PATCH(request('PATCH', body, '/api/admin/config')), 400);
    assert.equal(queries.length, 0);
}
const configured = await check(await adminConfig.PATCH(request('PATCH', { publicApiEnabled: false, apiConfig: { ...config.API_CONFIG_DEFAULTS,
    prediction: { ...config.API_CONFIG_DEFAULTS.prediction, defaultLimit: 4 } } }, '/api/admin/config')), 200);
assert.equal(configured.config.public_api_enabled, false);
assert.equal(configured.config.api_config.prediction.defaultLimit, 4);
assert.equal(configured.config.maintenance_mode, true, 'public API toggle must not alter maintenance');
schemaMissing = true;
const degraded = await config.readAppConfig(client);
assert.equal(degraded.status, 'degraded');
assert.equal(degraded.config.maintenance_mode, true);
assert.ok(degraded.error);
assert.equal((await check(await adminConfig.GET(), 200)).ok, false, 'fallback must not claim a full load');
schemaMissing = false;
databaseError = 'read failed';
assert.equal((await config.readAppConfig(client)).status, 'error');
databaseError = null;

await profile.writePublicProfile(client, user.id, { username: 'fixture_name' });
assert.equal(rows.profiles.length, 1);
const saved = await profile.writePublicProfile(client, user.id, { display_name: 'Fixture' });
assert.equal(saved.error, null);
assert.equal(rows.profiles[0].display_name, 'Fixture');
databaseError = 'RLS denied';
assert.equal((await profile.writePublicProfile(client, user.id, { username: 'new_name' })).error, 'RLS denied');
databaseError = null;

for (const body of [{ name: 'Fixture', scopes: 'bad' }, { name: 'Fixture', allowedOrigins: ['https://foo.invalid/path'] },
    { name: 'Fixture', expiresAt: 'bad' }, {}, []]) await check(await tokenRoutes.POST(request('POST', body)), 400);
await check(await tokenEditRoutes.PATCH(request('PATCH', {}), { params: Promise.resolve({ id: 'fixture-token' }) }), 400);
const token = await check(await tokenRoutes.POST(request('POST', { name: 'Isolated token', allowedOrigins: ['https://example.invalid'] })), 201);
assert.ok(token.token.startsWith('tt_live_'));
assert.equal(rows.api_tokens[0].token_hash.includes(token.token), false);
assert.deepEqual(rows.api_tokens[0].allowed_origins, ['https://example.invalid']);
await check(await tokenEditRoutes.PATCH(request('PATCH', { isActive: false }), { params: Promise.resolve({ id: token.record.id }) }), 200);
await check(await tokenEditRoutes.DELETE(request('DELETE'), { params: Promise.resolve({ id: token.record.id }) }), 200);
await check(await tokenEditRoutes.DELETE(request('DELETE', undefined, '/api/admin/api-tokens/id', { Origin: 'https://bad.invalid' }), { params: Promise.resolve({ id: 'fixture-token' }) }), 403);
isAdmin = false;
await check(await adminConfig.GET(), 403);
await check(await tokenRoutes.GET(), 403);
await check(await authAdmin.GET(), 403);
isAdmin = true;
await check(await authAdmin.GET(), 200);
const savedUser = user;
user = null;
await check(await trips.GET(request('GET')), 401);
await check(await trips.POST(request('POST', validTrip)), 401);
await check(await trips.PATCH(request('PATCH', { id: first.trip.id, patch: { fare: 1 } })), 401);
await check(await authAdmin.GET(), 401);
user = savedUser;

assert.equal(redirect.resolveAuthOrigin('https://custom.invalid', 'https://canonical.invalid'), 'https://custom.invalid');
assert.equal(redirect.resolveAuthCodeExchangeOrigin('https://custom.invalid', 'https://canonical.invalid', false), 'https://custom.invalid');
assert.equal(redirect.isAllowedAuthOrigin('https://attacker.vercel.app', 'https://canonical.invalid'), false);
assert.equal(redirect.isAllowedAuthOrigin('https://approved.invalid', 'https://canonical.invalid', 'https://approved.invalid'), true);
assert.equal(redirect.hasAuthCodeVerifierCookie(['sb-fixture-auth-token-code-verifier.0']), true);
for (const next of ['https://bad.invalid', '//bad.invalid', '/\\bad.invalid', '/\n/evil']) assert.equal(redirect.sanitizeAuthReturnTo(next), '/');
const authRequest = (suffix, verifier = true) => new NextRequest(`http://localhost:3000/auth/callback${suffix}`, {
    headers: verifier ? { Cookie: 'sb-fixture-auth-token-code-verifier=fixture' } : {},
});
for (const [suffix, expected] of [['?code=fixture&next=%2Fadmin', '/admin'], ['?code=fixture&type=recovery', '/auth/reset-password'], ['?code=fixture&type=signup', '/auth/verified'], ['?code=fixture&next=https://bad.invalid', '/']]) {
    const response = await callback.GET(authRequest(suffix));
    assert.equal(new URL(response.headers.get('location')).pathname, expected);
}
let response = await callback.GET(authRequest('?code=fixture&next=/admin', false));
assert.equal(new URL(response.headers.get('location')).searchParams.get('reason'), 'pkce_verifier_missing');
assert.equal(exchanges, 4, 'missing verifier cannot exchange or forward code');
exchangeResult = { data: { session: null }, error: null };
response = await callback.GET(authRequest('?code=fixture'));
assert.equal(new URL(response.headers.get('location')).pathname, '/login', 'no silent success without session');
await check(await callback.GET(new NextRequest('https://attacker.vercel.app/auth/callback?code=fixture')), 400);
const authEnvironment = Object.fromEntries(['NODE_ENV', 'NEXT_PUBLIC_SITE_URL', 'VERCEL_PROJECT_PRODUCTION_URL', 'AUTH_ALLOWED_ORIGINS'].map(key => [key, process.env[key]]));
try {
    process.env.NODE_ENV = 'production';
    process.env.NEXT_PUBLIC_SITE_URL = 'https://canonical.invalid';
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'project-production-alias.vercel.app';
    delete process.env.AUTH_ALLOWED_ORIGINS;
    for (const origin of ['https://canonical.invalid', 'https://project-production-alias.vercel.app',
        'https://traintracks-aaron-martinezs-projects-ea1c41f7.vercel.app']) {
        const aliasResponse = await callback.GET(new NextRequest(`${origin}/auth/callback?code=fixture&next=/admin`));
        const location = new URL(aliasResponse.headers.get('location'));
        assert.equal(location.origin, origin, 'canonical and platform production aliases keep same-origin PKCE failure handling');
        assert.equal(location.searchParams.get('reason'), 'pkce_verifier_missing');
    }
    await check(await callback.GET(new NextRequest('https://random-preview.vercel.app/auth/callback?code=fixture')), 400);

    const previewOrigin = 'https://traintracks-preview-aaron-martinezs-projects-ea1c41f7.vercel.app';
    process.env.AUTH_ALLOWED_ORIGINS = previewOrigin;
    const exchangesBeforePreview = exchanges;
    const missingVerifier = await callback.GET(new NextRequest(`${previewOrigin}/auth/callback?code=fixture&next=%2Fadmin`));
    const retryLocation = new URL(missingVerifier.headers.get('location'));
    assert.equal(missingVerifier.status, 307);
    assert.equal(retryLocation.origin, previewOrigin);
    assert.equal(retryLocation.pathname, '/login');
    assert.equal(retryLocation.searchParams.get('reason'), 'pkce_verifier_missing');
    assert.equal(retryLocation.searchParams.get('next'), '/admin');
    assert.equal(missingVerifier.headers.get('cache-control'), 'no-store');
    assert.equal(exchanges, exchangesBeforePreview, 'approved preview still requires its own PKCE verifier');

    exchangeResult = { data: { session: { user } }, error: null };
    const successfulPreview = await callback.GET(new NextRequest(`${previewOrigin}/auth/callback?code=fixture&next=%2Fadmin`, {
        headers: { Cookie: 'sb-fixture-auth-token-code-verifier=fixture' },
    }));
    const successLocation = new URL(successfulPreview.headers.get('location'));
    assert.equal(successfulPreview.status, 307);
    assert.equal(successLocation.origin, previewOrigin);
    assert.equal(successLocation.pathname, '/admin');
    assert.equal(exchanges, exchangesBeforePreview + 1);
    assert.equal(successfulPreview.headers.get('cache-control'), 'no-store');
    for (const origin of ['https://random-preview.vercel.app', `${previewOrigin}.attacker.invalid`,
        previewOrigin.replace('https:', 'http:')]) {
        await check(await callback.GET(new NextRequest(`${origin}/auth/callback?code=fixture`, {
            headers: { Cookie: 'sb-fixture-auth-token-code-verifier=fixture',
                'X-Forwarded-Host': new URL(previewOrigin).host, 'X-Forwarded-Proto': 'https' },
        })), 400);
    }
    assert.equal(exchanges, exchangesBeforePreview + 1, 'unapproved hosts cannot trigger code exchange, even with spoofed forwarding headers');
} finally {
    for (const [key, value] of Object.entries(authEnvironment)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }
}

const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { ApiDocs } = require('../src/components/ApiDocs.tsx');
const docsHtml = renderToStaticMarkup(React.createElement(ApiDocs));
assert.equal(/[\u00c2\u00e2]/.test(docsHtml), false, 'rendered docs must not contain mojibake');
assert.ok(docsHtml.includes('Trip History'));

// Exercise the shared auth runtime, including store identity publication and sign-out failure.
global.window = { addEventListener() {}, dispatchEvent() {}, location: { reload() {} } };
global.Event = class Event { constructor(type) { this.type = type; } };
Module._load = function(request, parent, isMain) {
    if (request === 'react') return { useEffect: effect => effect(), useSyncExternalStore: (_subscribe, snapshot) => snapshot() };
    if (request === '@/store/useTripStore') return { useTripStore: { getState: () => ({ setAuthenticatedUserId(id) { synchronizedOwner = id; } }) } };
    if (['@/lib/supabase/server', '@/lib/supabase/client'].includes(request)) return { createClient: asyncOrSyncClient(request) };
    if (request === '@/lib/supabase/admin') return { createAdminClient: () => client, hasAdminSupabaseConfig: () => true };
    return originalLoad.call(this, request, parent, isMain);
};
const auth = require('../src/hooks/useAuth.ts');
auth.useAuth();
const flush = () => new Promise(resolve => setTimeout(resolve, 15));
await flush();
assert.equal(synchronizedOwner, user.id);
assert.equal(auth.useAuth().isAuthenticated, true);
authError = { message: 'sign-out failed' };
await assert.rejects(auth.useAuth().signOut(), error => error.message === 'sign-out failed');
assert.equal(auth.useAuth().isAuthenticated, true, 'failed sign-out must not pretend success');
authError = null;
authCallback('SIGNED_OUT', null);
await flush();
assert.equal(synchronizedOwner, null);
assert.equal(auth.useAuth().isAuthenticated, false);
auth.disposeAuthRuntimeForTests();
authError = { message: 'session restore failed' };
auth.useAuth();
await flush();
assert.equal(auth.useAuth().isAuthenticated, false);
assert.equal(auth.useAuth().profileStatus, 'error');
assert.equal(synchronizedOwner, null);
auth.disposeAuthRuntimeForTests();
authError = null;

const migration = fs.readFileSync('supabase/20261009_api_auth_repair.sql', 'utf8');
assert.equal(/update public\.user_roles|revoke all on public\.profiles|grant insert.*updated_at/is.test(migration), false);
assert.ok(migration.includes('security invoker'));
assert.ok(migration.includes('user_id = auth.uid()'));
assert.match(migration, /revoke all on function public\.trip_history_totals\(\) from public, anon;/i, 'revoke both PUBLIC and direct/default anon EXECUTE');
assert.match(migration, /grant execute on function public\.trip_history_totals\(\) to authenticated;/i, 'authenticated totals remain available');
assert.equal(/traintracks_cfg_|traintracks_api_enabled/.test(fs.readFileSync('src/components/ApiConsole.tsx', 'utf8')), false);
console.log('API/auth/config regression suite passed: isolated handlers, validation, stable retry completion, default3/pagination/totals, schema fallback, profile payload grants, role denial, origin/PKCE/session handling, and verified store identity.');
