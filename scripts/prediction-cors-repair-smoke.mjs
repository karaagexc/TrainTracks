import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';
import ts from 'typescript';

// Production-mode handlers with isolated token/config adapters. No credentials,
// backend calls, stream consumers, or prediction-engine changes are required.
const root = process.cwd();
const require = Module.createRequire(import.meta.url);
const originalResolve = Module._resolveFilename;
const originalLoad = Module._load;
const originalTs = Module._extensions['.ts'];
const originalNow = Date.now;
const keys = ['NODE_ENV', 'NEXT_PUBLIC_SITE_URL', 'VERCEL_URL', 'VERCEL_PROJECT_PRODUCTION_URL',
    'TRAINTRACKS_PUBLIC_API_ORIGINS', 'TRAINTRACKS_PUBLIC_API_TOKENS', 'PREDICTION_API_TOKENS',
    'TRAINTRACKS_PUBLIC_API_TOKEN_HASHES', 'PREDICTION_API_TOKEN_HASHES'];
const savedEnv = Object.fromEntries(keys.map(key => [key, process.env[key]]));
keys.forEach(key => delete process.env[key]);
process.env.NODE_ENV = 'production';
process.env.NEXT_PUBLIC_SITE_URL = 'https://traintracks.test';
process.env.TRAINTRACKS_PUBLIC_API_ORIGINS = 'https://partner.test';
let clock = Date.parse('2026-10-09T04:00:00Z');
Date.now = () => clock;
let config;
let configStatus = 'ready';
let configReads = 0;
let usageWrites = 0;
let databaseConfigured = true;
let tokenRow = null;
const tokenRows = new Map();
const admin = { from(table) {
    assert.equal(table, 'api_tokens');
    let operation = 'select';
    const filters = {};
    const builder = {
        select() { return this; },
        eq(key, value) { filters[key] = value; return this; },
        maybeSingle: async () => ({ data: tokenRows.get(filters.token_hash) ?? null, error: null }),
        update() { operation = 'update'; return this; },
        then(resolve) { assert.equal(operation, 'update'); usageWrites++; resolve({ error: null }); },
    };
    return builder;
} };
Module._resolveFilename = function resolveAlias(request, parent, isMain, options) {
    if (request === 'server-only') return path.join(root, 'node_modules/next/dist/compiled/server-only/empty.js');
    return originalResolve.call(this, request.startsWith('@/') ? path.join(root, 'src', request.slice(2)) : request, parent, isMain, options);
};
Module._load = function loadFixture(request, parent, isMain) {
    if (request === '@/lib/supabase/admin') return {
        createAdminClient: () => admin, hasAdminSupabaseConfig: () => databaseConfigured,
    };
    if (request === '@/domain/config/server') return { loadServerConfig: async () => {
        configReads++;
        return { status: configStatus, config: configStatus === 'ready' ? config : null, error: configStatus === 'ready' ? null : 'fixture unavailable' };
    } };
    return originalLoad.call(this, request, parent, isMain);
};
Module._extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);

try {
    const { API_CONFIG_DEFAULTS } = require('../src/domain/config/index.ts');
    config = { public_api_enabled: true, api_config: structuredClone(API_CONFIG_DEFAULTS), updated_at: 'isolated-cors-fixture' };
    const { NextRequest } = require('next/server');
    const { verifyPredictionApiAccess, hashPredictionApiToken } = require('../src/domain/predictions/apiAccess.ts');
    const { getPublicApiHeaders, getConfiguredPublicApiHeaders, isPublicApiOriginAllowed, noStoreHeaders } = require('../src/domain/predictions/http.ts');
    const { getServerApiConfiguration, SERVER_CONFIG_TTL_MS } = require('../src/domain/predictions/serverConfig.ts');
    const endpoint = '/api/public/predictions';
    const external = 'https://external.test';
    const partner = 'https://partner.test';
    const sameOrigin = 'https://traintracks.test';
    const request = ({ origin = external, token = 'open-token', pathname = endpoint, method = 'GET', extra = {} } = {}) => new NextRequest(`https://traintracks.test${pathname}`, {
        method,
        headers: { ...(origin === null ? {} : { origin }), ...(token === null ? {} : { authorization: `Bearer ${token}` }), ...extra },
    });
    const verify = (req, requiredScope = 'predictions:read', env = process.env) => verifyPredictionApiAccess({ headers: req.headers, url: req.nextUrl, requiredScope, env });
    const cors = req => new Headers(getPublicApiHeaders(req));
    const noCredentials = headers => assert.equal(headers.get('access-control-allow-credentials'), null);
    const refresh = async () => { clock += SERVER_CONFIG_TTL_MS + 1; await getServerApiConfiguration(); };
    const addToken = (value, allowedOrigins = [], scopes = ['predictions:read'], expiresAt = null) => {
        const row = { id: `fixture-${value}`, allowed_origins: allowedOrigins, scopes, expires_at: expiresAt };
        tokenRows.set(hashPredictionApiToken(value), row);
        return row;
    };
    addToken('open-token');
    tokenRow = addToken('restricted-token', [partner]);
    addToken('scope-token', [], ['incidents:read']);
    addToken('expired-token', [], ['predictions:read'], new Date(clock - 1000).toISOString());

    const open = request();
    assert.equal((await verify(open)).ok, true, 'production external unrestricted token uses configured wildcard');
    assert.equal(cors(open).get('access-control-allow-origin'), '*');
    noCredentials(cors(open));
    assert.equal(cors(open).get('vary'), 'Origin');
    assert.equal(isPublicApiOriginAllowed(open), false, 'wildcard must not widen the explicit-origin security helper');
    const preflight = request({ token: null, method: 'OPTIONS', extra: {
        'access-control-request-method': 'GET', 'access-control-request-headers': 'authorization,x-api-key',
    } });
    const preflightHeaders = new Headers(await getConfiguredPublicApiHeaders(preflight));
    assert.equal(preflightHeaders.get('access-control-allow-origin'), '*');
    assert.equal(preflightHeaders.get('access-control-allow-methods'), 'GET, OPTIONS');
    assert.match(preflightHeaders.get('access-control-allow-headers'), /Authorization/);
    noCredentials(preflightHeaders);
    assert.equal((await verify(request({ pathname: `${endpoint}/stream` }))).ok, true);
    assert.equal(cors(request({ pathname: `${endpoint}/stream` })).get('access-control-allow-origin'), '*');
    for (const pathname of ['/api/predictions', '/admin', '/api/public/predictions/extra', '/api/public/congestion', '/api/public/incidents', '/api/public/crowd/presence']) {
        assert.equal((await verify(request({ pathname }))).code, 'origin_not_allowed', `${pathname}: no new wildcard authorization`);
        assert.equal(cors(request({ pathname })).get('access-control-allow-origin'), null);
    }
    assert.equal(cors(request({ method: 'POST' })).get('access-control-allow-origin'), null);
    assert.equal((await verify(open, 'crowd:write')).code, 'origin_not_allowed');

    const writesBeforeDenied = usageWrites;
    for (const [token, expected] of [['missing', 'invalid_api_token'], ['scope-token', 'insufficient_scope'], ['expired-token', 'invalid_api_token']]) {
        assert.equal((await verify(request({ token }))).code, expected);
    }
    assert.equal((await verify(request({ token: null, extra: { cookie: 'sb-fixture-auth-token=not-an-api-token' } }))).code, 'missing_api_token');
    assert.equal((await verify(request({ token: 'restricted-token' }))).code, 'origin_not_allowed', 'wildcard never bypasses a token origin allowlist');
    assert.equal((await verify(request({ token: 'restricted-token', origin: sameOrigin }))).code, 'origin_not_allowed', 'same origin does not bypass token restrictions');
    assert.equal(usageWrites, writesBeforeDenied, 'denied origins/scopes/tokens never update usage');
    const restricted = request({ token: 'restricted-token', origin: partner });
    assert.equal((await verify(restricted)).ok, true, 'restricted token passes its configured and token origin checks');
    assert.equal(cors(restricted).get('access-control-allow-origin'), partner, 'restricted origin is reflected, not wildcarded');
    noCredentials(cors(restricted));
    tokenRow.allowed_origins = [external];
    assert.equal((await verify(request({ token: 'restricted-token' }))).code, 'origin_not_allowed', 'restricted token must still satisfy the explicit configured-origin gate');
    tokenRow.allowed_origins = [partner];
    assert.equal((await verify(request({ token: 'restricted-token', origin: null }))).ok, true, 'existing non-browser token semantics are preserved');

    for (const origin of ['null', '*', 'external.test', 'https://external.test/path', 'https://user:secret@external.test', 'https://external.test, https://partner.test', 'file://local', 'https://external.test/']) {
        const invalid = request({ origin });
        assert.equal((await verify(invalid)).code, 'origin_not_allowed', `reject invalid Origin: ${origin}`);
        assert.equal(cors(invalid).get('access-control-allow-origin'), null);
    }
    const firstParty = request({ origin: sameOrigin, pathname: '/api/predictions' });
    assert.equal(isPublicApiOriginAllowed(firstParty), true);
    assert.equal(cors(firstParty).get('access-control-allow-origin'), sameOrigin);
    assert.equal(new Headers(noStoreHeaders()).get('access-control-allow-origin'), null, 'internal response headers are unchanged');

    databaseConfigured = false;
    const envToken = { NODE_ENV: 'production', TRAINTRACKS_PUBLIC_API_TOKENS: 'env-token' };
    assert.equal((await verify(request({ token: 'env-token' }), 'predictions:read', envToken)).ok, true);
    assert.equal((await verify(request({ token: 'env-token' }), 'predictions:read', { NODE_ENV: 'production', TRAINTRACKS_PUBLIC_API_TOKEN_HASHES: hashPredictionApiToken('env-token') })).ok, true);
    const noScope = request({ token: 'env-token' });
    assert.equal((await verifyPredictionApiAccess({ headers: noScope.headers, url: noScope.nextUrl, env: envToken })).code, 'origin_not_allowed', 'no wildcard without a prediction-read scope');
    assert.equal((await verify(request({ token: 'env-token', extra: { authorization: '', 'x-api-key': 'env-token' } }), 'predictions:read', envToken)).ok, true);
    databaseConfigured = true;

    config.api_config.corsOrigin = partner;
    await refresh();
    assert.equal((await verify(open)).code, 'origin_not_allowed', 'exact production origin config still denies external origins');
    assert.equal(cors(open).get('access-control-allow-origin'), null);
    assert.equal((await verify(restricted)).ok, true);
    assert.equal(cors(restricted).get('access-control-allow-origin'), partner);
    assert.equal(cors(firstParty).get('access-control-allow-origin'), sameOrigin);
    config.api_config.corsOrigin = '*';
    config.public_api_enabled = false;
    await refresh();
    assert.equal((await verify(open)).code, 'public_api_disabled', 'wildcard does not bypass the public switch');
    config.public_api_enabled = true;
    configStatus = 'error';
    await refresh();
    assert.equal((await verify(open)).code, 'origin_not_allowed', 'unavailable config cannot activate wildcard');
    assert.equal(cors(open).get('access-control-allow-origin'), null);
    assert.equal((await verify(request({ origin: sameOrigin }))).code, 'api_config_unavailable');
    configStatus = 'ready';
    await refresh();

    // Actual GET/OPTIONS route wiring; only config/token transport is replaced.
    const handler = require('../src/app/api/public/predictions/route.ts');
    const routeSuccess = await handler.GET(open);
    assert.equal(routeSuccess.status, 200);
    assert.equal(routeSuccess.headers.get('access-control-allow-origin'), '*');
    assert.match(routeSuccess.headers.get('cache-control'), /no-store/);
    noCredentials(routeSuccess.headers);
    assert.ok(Array.isArray((await routeSuccess.json()).predictions));
    const routeDenied = await handler.GET(request({ token: 'restricted-token' }));
    assert.equal(routeDenied.status, 403);
    assert.equal((await routeDenied.json()).error, 'origin_not_allowed');
    const routeRestricted = await handler.GET(restricted);
    assert.equal(routeRestricted.status, 200);
    assert.equal(routeRestricted.headers.get('access-control-allow-origin'), partner);
    noCredentials(routeRestricted.headers);
    const options = await handler.OPTIONS(preflight);
    assert.equal(options.status, 204);
    assert.equal(options.headers.get('access-control-allow-origin'), '*');
    noCredentials(options.headers);
    const internalHandler = require('../src/app/api/predictions/route.ts');
    const internalResponse = await internalHandler.GET(firstParty);
    assert.equal(internalResponse.status, 200);
    assert.equal(internalResponse.headers.get('access-control-allow-origin'), null);
    assert.match(fs.readFileSync('src/components/ApiConsole.tsx', 'utf8'), /Unrestricted prediction reads only/);
    assert.match(fs.readFileSync('src/components/ApiDocs.tsx', 'utf8'), /Unrestricted prediction reads only/);
    console.log(`Prediction CORS repair passed: production wildcard GET/OPTIONS and token authentication, restricted token origin/scope enforcement, explicit origins, same-origin internal navigation, write isolation, and no credentialed wildcard (${configReads} isolated config reads; no backend calls).`);
} finally {
    Module._resolveFilename = originalResolve;
    Module._load = originalLoad;
    if (originalTs) Module._extensions['.ts'] = originalTs;
    else delete Module._extensions['.ts'];
    Date.now = originalNow;
    for (const key of keys) {
        if (savedEnv[key] === undefined) delete process.env[key];
        else process.env[key] = savedEnv[key];
    }
}
