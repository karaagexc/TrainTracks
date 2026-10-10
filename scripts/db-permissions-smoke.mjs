import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import Module from 'node:module';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const prefix = path.join(root, '.tmp-edge-debug', 'isolated-db');
const fixture = name => fs.readFileSync(path.join(root, 'scripts', 'fixtures', 'db', name), 'utf8');
const migrations = [
    'migration.sql', 'app_config_migration.sql', 'trip_history_migration.sql',
    '20260809_security_reliability.sql', '20261009_api_auth_repair.sql', '20261009_crowd_repair.sql',
];
const migrationSources = new Map(migrations.map(name => [name, fs.readFileSync(path.join(root, 'supabase', name), 'utf8')]));
const migration = name => migrationSources.get(name);
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const ADMIN = '33333333-3333-4333-8333-333333333333';
const C = '44444444-4444-4444-8444-444444444444';
const report = {
    startedAt: new Date().toISOString(), host: '127.0.0.1', cases: [],
    migrations: migrations.map(name => ({ name, sha256: createHash('sha256').update(migration(name)).digest('hex') })),
    limitations: [
        'JWT claims are supplied by a local trusted gateway fixture, not signature-verified by GoTrue/PostgREST.',
        'Supabase HTTP, cookie/session refresh, OAuth, Storage HTTP and actual Realtime websocket transport are not tested.',
        'Realtime observation insertion is a transport stub after an actual PostgreSQL delivery claim.',
        'Configuration JSON validation runs the application validator; SQL jsonb storage does not itself enforce that schema.',
        'Transactional rollback is tested; no production down migration is supplied or executed.',
        'Legacy crowd RPC shims preserve names but reject unfenced completion/release; old workers must upgrade before acknowledging deliveries.',
    ],
};
let embedded;
let owner;
let connection;
let runDir;
const clients = new Set();
const logs = [];
let exitRequested = false;

async function check(name, fn) {
    const started = Date.now();
    try {
        const details = await fn();
        report.cases.push({ name, status: 'pass', durationMs: Date.now() - started, ...(details ? { details } : {}) });
        console.log(`PASS ${name}`);
    } catch (error) {
        report.cases.push({ name, status: 'fail', durationMs: Date.now() - started,
            error: error.message, code: error.code ?? null, detail: error.detail ?? null });
        console.error(`FAIL ${name}: ${error.message}${error.code ? ` [${error.code}]` : ''}`);
    }
}

function unusedPort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address();
            server.close(error => error ? reject(error) : resolve(port));
        });
    });
}

async function client(role, userId) {
    assert.ok(['anon', 'authenticated', 'service_role'].includes(role));
    const { Client } = isolatedRequire('pg');
    const db = new Client({ ...connection, user: 'authenticator', application_name: 'traintracks-isolated-smoke' });
    clients.add(db);
    db.on('error', error => logs.push(`client: ${error.message}`));
    await db.connect();
    await db.query(`set role ${role}`);
    await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ role, ...(userId ? { sub: userId } : {}) })]);
    await db.query("set statement_timeout = '20000'");
    const identity = (await db.query('select current_user, session_user')).rows[0];
    assert.equal(identity.current_user, role);
    assert.equal(identity.session_user, 'authenticator');
    return db;
}

async function close(db) {
    try { await db.end(); } finally { clients.delete(db); }
}

async function asRole(role, userId, fn, commit = false) {
    const db = await client(role, userId);
    try {
        await db.query('begin');
        const result = await fn(db);
        await db.query(commit ? 'commit' : 'rollback');
        return result;
    } catch (error) {
        await db.query('rollback').catch(() => {});
        throw error;
    } finally { await close(db); }
}

async function denied(db, sql, values = [], code = '42501') {
    await db.query('savepoint expected_denial');
    let error;
    try { await db.query(sql, values); } catch (caught) { error = caught; }
    await db.query('rollback to savepoint expected_denial');
    await db.query('release savepoint expected_denial');
    assert.equal(error?.code, code, `Expected SQLSTATE ${code}, got ${error?.code ?? 'successful query'}: ${sql}`);
}

// This adapter replaces only HTTP transport. All reads/writes go through real PG
// grants and RLS, while the application profile/config/token functions stay intact.
function transport(role, userId) {
    const tables = new Set(['profiles', 'profile_private', 'app_config', 'api_tokens']);
    const identifier = value => {
        assert.match(value, /^[a-z_][a-z0-9_]*$/);
        return `"${value}"`;
    };
    return { from(table) {
        assert.ok(tables.has(table));
        let operation = 'select';
        let fields = '*';
        let data;
        const filters = [];
        let single = false;
        let required = false;
        const builder = {
            select(value) { fields = value; return this; },
            update(value) { operation = 'update'; data = value; return this; },
            insert(value) { operation = 'insert'; data = value; return this; },
            eq(key, value) { filters.push([key, value]); return this; },
            single() { single = true; required = true; return this; },
            maybeSingle() { single = true; return this; },
            then(resolve, reject) { return execute().then(resolve, reject); },
        };
        async function execute() {
            try {
                return await asRole(role, userId, async db => {
                    const values = [];
                    const bind = value => { values.push(value); return `$${values.length}`; };
                    const columns = fields === '*' ? '*' : fields.split(',').map(identifier).join(',');
                    let sql;
                    if (operation === 'insert') {
                        sql = `insert into public.${identifier(table)} (${Object.keys(data).map(identifier)}) values (${Object.values(data).map(bind)})`;
                    } else if (operation === 'update') {
                        sql = `update public.${identifier(table)} set ${Object.entries(data).map(([key, value]) => `${identifier(key)}=${bind(value)}`).join(',')}`;
                    } else sql = `select ${columns} from public.${identifier(table)}`;
                    if (filters.length) sql += ` where ${filters.map(([key, value]) => `${identifier(key)}=${bind(value)}`).join(' and ')}`;
                    if (operation !== 'select') sql += ` returning ${columns}`;
                    const rows = (await db.query(sql, values)).rows.map(row => JSON.parse(JSON.stringify(row)));
                    if (single && (rows.length > 1 || (required && rows.length !== 1))) {
                        return { data: null, error: { code: 'PGRST116', message: 'Expected a single row.' } };
                    }
                    return { data: single ? rows[0] ?? null : rows, error: null };
                }, operation !== 'select');
            } catch (error) { return { data: null, error: { code: error.code, message: error.message } }; }
        }
        return builder;
    } };
}

const require = Module.createRequire(import.meta.url);
let isolatedRequire;
try { isolatedRequire = Module.createRequire(path.join(prefix, 'package.json')); isolatedRequire.resolve('embedded-postgres'); }
catch {
    console.error('Install the isolated test tools first: npm install --prefix .tmp-edge-debug/isolated-db');
    process.exitCode = 1;
    exitRequested = true;
}

const originalResolve = Module._resolveFilename;
const originalLoad = Module._load;
Module._resolveFilename = function (request, parent, isMain, options) {
    if (request === 'server-only') return path.join(root, 'node_modules', 'next', 'dist', 'compiled', 'server-only', 'empty.js');
    if (request.startsWith('@/')) request = path.join(root, 'src', request.slice(2));
    return originalResolve.call(this, request, parent, isMain, options);
};
Module._extensions['.ts'] = Module._extensions['.tsx'] = (module, filename) => {
    module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
        compilerOptions: { esModuleInterop: true, jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText, filename);
};
Module._load = function (request, parent, isMain) {
    if (request === '@/lib/supabase/admin') return {
        createAdminClient: () => transport('service_role'), hasAdminSupabaseConfig: () => true,
    };
    if (request === '@/domain/config/server') return {
        loadServerConfig: () => config.readAppConfig(transport('anon')),
    };
    return originalLoad.call(this, request, parent, isMain);
};
const config = require('../src/domain/config/index.ts');
const { validateTokenEdit } = require('../src/domain/auth/token.ts');
const { writePublicProfile } = require('../src/domain/auth/profile.ts');
const { validateTrip } = require('../src/app/api/trips/validation.ts');

async function preservedSnapshot() {
    const tables = ['profiles', 'profile_private', 'user_roles', 'api_tokens', 'trip_history', 'crowd_presence', 'crowd_incidents', 'stall_reports', 'incident_resolution_votes'];
    const result = {};
    for (const table of tables) result[table] = (await owner.query(`select to_jsonb(t) as row from public.${table} t order by to_jsonb(t)::text`)).rows;
    result.maintenance = (await owner.query('select maintenance_mode,maintenance_message,congestion_config,updated_at from public.app_config')).rows;
    return result;
}

async function functionSnapshot() {
    return (await owner.query(`select p.oid::regprocedure::text as signature, pg_get_functiondef(p.oid) as definition,
        p.proacl::text as permissions from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' order by signature`)).rows;
}

function transactionBody(sql) {
    // Only unwrap the known standalone BEGIN/COMMIT of these two owned migration inputs.
    const start = sql.search(/^begin;\s*$/im);
    const end = sql.search(/^commit;\s*$/im);
    assert.ok(start >= 0 && end > start && sql.slice(end).trim().toLowerCase() === 'commit;');
    return sql.slice(start + 'begin;'.length, end);
}

const recordSql = 'select public.record_crowd_presence($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) as result';
const claimSql = 'select public.claim_crowd_presence_broadcast($1,$2,$3) as result';
const markSql = 'select public.mark_crowd_presence_broadcasted($1,$2,$3,$4) as result';
const releaseSql = 'select public.release_crowd_presence_broadcast($1,$2,$3) as result';
const pseudonym = name => createHash('sha256').update(`synthetic-only:${name}`).digest('hex');
const crowdArgs = (device, sample, time = new Date()) => [pseudonym(device), 'LRT2', 'EASTBOUND', 'MOVING', 'L2-01', 'Recto', 14.603, 120.983, 20, 0.8, 10, sample, time, 3000];
const result = async (db, sql, values) => (await db.query(sql, values)).rows[0].result;

async function exercise() {
    await owner.query(fixture('bootstrap.sql'));
    for (const name of migrations.slice(0, 3)) await owner.query(migration(name));
    await owner.query(fixture('legacy-data.sql'));
    await owner.query(migration(migrations[3]));
    await owner.query("alter role authenticator login password '" + connection.password + "'");
    await owner.query(`insert into public.api_tokens(name,token_hash,token_prefix,scopes,created_by)
        values ('Preserved legacy token',$1,'tt_fixture',array['predictions:read'],$2)`, [pseudonym('legacy-token'), ADMIN]);
    await owner.query(`insert into public.crowd_presence(pseudonym,line_id,direction,status_code,lat,lng,speed_kph,confidence,sample_id,expires_at)
        values ($1,'LRT2','EASTBOUND','MOVING',14.603,120.983,20,0.8,'legacy-sample',now()+interval '1 hour')`, [pseudonym('legacy')]);
    await owner.query(fixture('secured-data.sql'));
    const preserved = await preservedSnapshot();
    const originalFunctions = await functionSnapshot();

    await check('Incremental migrations roll back atomically without changing legacy data/roles', async () => {
        await owner.query('begin');
        try {
            for (const name of migrations.slice(4)) await owner.query(transactionBody(migration(name)));
        } finally { await owner.query('rollback'); }
        assert.deepEqual(await preservedSnapshot(), preserved);
        assert.deepEqual(await functionSnapshot(), originalFunctions);
        assert.equal((await owner.query("select to_regclass('public.crowd_presence_deliveries') as relation")).rows[0].relation, null);
        assert.equal((await owner.query("select count(*)::int as n from information_schema.columns where table_schema='public' and table_name='app_config' and column_name='api_config'")).rows[0].n, 0);
    });
    for (const name of migrations.slice(4)) await owner.query(migration(name));
    await check('Forward migration and repeated application preserve existing data and authorities', async () => {
        assert.deepEqual(await preservedSnapshot(), preserved);
        const functions = await functionSnapshot();
        for (const name of migrations.slice(4)) await owner.query(migration(name));
        assert.deepEqual(await preservedSnapshot(), preserved);
        assert.deepEqual(await functionSnapshot(), functions);
        const old = (await owner.query('select client_trip_id from public.trip_history')).rows[0];
        assert.equal(old.client_trip_id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    });
    await check('Legacy service mark/release RPC signatures remain available during rolling rollback', async () => {
        const functions = (await owner.query(`select
            to_regprocedure('public.mark_crowd_presence_broadcasted(text,text,timestamp with time zone)')::text as mark,
            to_regprocedure('public.release_crowd_presence_broadcast(text,text)')::text as release`)).rows[0];
        assert.ok(functions.mark && functions.release, 'Incremental crowd migration removes old mark/release signatures; old API processes need coordinated rollout/rollback.');
        await asRole('service_role', null, async db => {
            assert.equal((await result(db, 'select public.mark_crowd_presence_broadcasted($1,$2,$3) as result', [pseudonym('legacy'), 'legacy-sample', new Date()])).code, 'claim_token_required');
            assert.equal((await result(db, 'select public.release_crowd_presence_broadcast($1,$2) as result', [pseudonym('legacy'), 'legacy-sample'])).code, 'claim_token_required');
            assert.equal((await db.query('select broadcast_sample_id from public.crowd_presence where sample_id=$1', ['legacy-sample'])).rows[0].broadcast_sample_id, null);
        });
        return { legacyAcknowledgment: 'safely rejected; workers must upgrade', requiredCode: 'claim_token_required' };
    });

    await check('Anon can read only public profile columns, not private records or tokens', () => asRole('anon', null, async db => {
        assert.equal((await db.query('select id,username,display_name,avatar_url,created_at,updated_at from public.profiles')).rowCount, 3);
        for (const sql of ['select * from public.profiles', 'select email from public.profiles', 'select * from public.profile_private', 'select * from public.api_tokens', 'select * from public.user_roles']) await denied(db, sql);
        await denied(db, "update public.profiles set display_name='forged' where id=$1", [A]);
    }));
    await check('Commuter own profile edits/upsert honor column grants and server timestamps', () => asRole('authenticated', A, async db => {
        const upsert = await db.query(`insert into public.profiles(id,username,display_name,avatar_url) values ($1,'commuter_a','Safe upsert','')
            on conflict(id) do update set display_name=excluded.display_name,avatar_url=excluded.avatar_url returning id,display_name,updated_at`, [A]);
        assert.equal(upsert.rows[0].display_name, 'Safe upsert');
        const update = await db.query("update public.profiles set display_name='Safe edit',updated_at='2099-01-01' where id=$1 returning updated_at", [A]);
        assert.ok(Math.abs(update.rows[0].updated_at.getTime() - Date.now()) < 30000);
        await denied(db, 'update public.profiles set is_admin=true where id=$1', [A]);
        await denied(db, 'update public.profiles set email=$1 where id=$2', ['forged@invalid.test', A]);
        await denied(db, `insert into public.profiles(id,display_name,updated_at) values ($1,'Unsafe','2099-01-01') on conflict(id) do update set updated_at=excluded.updated_at`, [A]);
        await denied(db, `insert into public.profiles(id,display_name) values ($1,'Unsafe') on conflict(id) do update set id=excluded.id`, [A]);
        assert.equal((await db.query("update public.profiles set display_name='Other account' where id=$1", [B])).rowCount, 0);
    }));
    await check('Private profile reads/edits remain owner-only; upserts cannot transfer owner', () => asRole('authenticated', A, async db => {
        assert.equal((await db.query('select * from public.profile_private')).rowCount, 1);
        assert.equal((await db.query('select email from public.profile_private')).rows[0].email, 'commuter-a@invalid.test');
        const own = await db.query(`insert into public.profile_private(user_id,email,phone,has_password) values ($1,'updated@invalid.test','+00000000003',true)
            on conflict(user_id) do update set email=excluded.email,phone=excluded.phone,updated_at='2099-01-01' returning updated_at`, [A]);
        assert.ok(Math.abs(own.rows[0].updated_at.getTime() - Date.now()) < 30000);
        assert.equal((await db.query('select * from public.profile_private where user_id=$1', [B])).rowCount, 0);
        await denied(db, "insert into public.profile_private(user_id,email) values ($1,'forged@invalid.test')", [B]);
        await denied(db, 'update public.profile_private set user_id=$1 where user_id=$2', [B, A]);
    }));
    await check('Existing user_roles authority cannot be self-promoted or inferred from metadata', async () => {
        await asRole('authenticated', A, async db => {
            assert.equal((await db.query('select public.current_user_is_admin() as admin')).rows[0].admin, false);
            assert.deepEqual((await db.query('select user_id,role from public.user_roles')).rows, [{ user_id: A, role: 'commuter' }]);
            await denied(db, "update public.user_roles set role='admin' where user_id=$1", [A]);
            await denied(db, "insert into public.user_roles(user_id,role) values ($1,'admin')", [A]);
        });
        await asRole('authenticated', ADMIN, async db => {
            assert.equal((await db.query('select public.current_user_is_admin() as admin')).rows[0].admin, true);
            assert.equal((await db.query('select * from public.profile_private where user_id=$1', [A])).rowCount, 0);
            await denied(db, 'select * from public.api_tokens');
        });
        await owner.query('begin');
        try {
            await owner.query('update public.profiles set is_admin=false where id=$1', [ADMIN]);
            assert.equal(await asRole('authenticated', ADMIN, async db => (await db.query('select public.current_user_is_admin() as admin')).rows[0].admin), true);
        } finally { await owner.query('rollback'); }
    });
    await check('New auth user trigger and application profile insert/update are acknowledged', async () => {
        await owner.query(`insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data) values ($1,'new@invalid.test','{"provider":"google"}','{"full_name":"New user","is_admin":true}')`, [C]);
        const privateRow = (await owner.query('select has_password from public.profile_private where user_id=$1', [C])).rows[0];
        assert.equal(privateRow.has_password, false);
        assert.equal((await owner.query('select role from public.user_roles where user_id=$1', [C])).rows[0].role, 'commuter');
        await owner.query('delete from public.profiles where id=$1', [C]);
        assert.equal((await writePublicProfile(transport('authenticated', C), C, { username: 'new_fixture', display_name: 'Inserted' })).error, null);
        assert.equal((await writePublicProfile(transport('authenticated', C), C, { display_name: 'Updated' })).error, null);
        assert.equal((await owner.query('select display_name from public.profiles where id=$1', [C])).rows[0].display_name, 'Updated');
        assert.ok((await writePublicProfile(transport('authenticated', B), C, { display_name: 'Foreign' })).error);
    });

    await check('App config preserves maintenance and exposes validated persisted defaults', async () => {
        const loaded = await config.readAppConfig(transport('anon'));
        assert.equal(loaded.status, 'ready');
        assert.equal(loaded.config.maintenance_mode, true);
        assert.equal(loaded.config.maintenance_message, 'Preserve this legacy fixture');
        assert.deepEqual(loaded.config.api_config, config.API_CONFIG_DEFAULTS);
        assert.equal(loaded.config.congestion_config.calendar[0].label, 'Legacy test event');
    });
    await check('Config validation rejects malformed values without persistence; admin writes use server time', async () => {
        const before = (await owner.query('select * from public.app_config')).rows[0];
        for (const bad of [null, {}, { ...config.API_CONFIG_DEFAULTS, corsOrigin: 'https://invalid.test/path' },
            { ...config.API_CONFIG_DEFAULTS, crowd: { intervalMs: 1, minSpeedKph: 5, requiredSamples: 2 } },
            { ...config.API_CONFIG_DEFAULTS, prediction: { defaultLimit: null, validWindowS: 25, stationLookaheadMin: 45 } }]) assert.equal(config.validateApiConfig(bad).ok, false);
        assert.equal(config.validateCongestionConfig({ calendar: [{ date: '2026-02-30' }] }).ok, false);
        assert.deepEqual((await owner.query('select * from public.app_config')).rows[0], before);
        await asRole('authenticated', A, async db => assert.equal((await db.query('update public.app_config set public_api_enabled=false where id=1')).rowCount, 0));
        await asRole('anon', null, async db => assert.equal((await db.query('update public.app_config set public_api_enabled=false where id=1')).rowCount, 0));
        const edited = structuredClone(config.API_CONFIG_DEFAULTS);
        edited.crowd.intervalMs = 6000;
        assert.equal(config.validateApiConfig(edited).ok, true);
        await asRole('authenticated', ADMIN, async db => {
            const write = await db.query("update public.app_config set api_config=$1,updated_at='2099-01-01' where id=1 returning updated_at", [edited]);
            assert.equal(write.rowCount, 1);
            assert.ok(Math.abs(write.rows[0].updated_at.getTime() - Date.now()) < 30000);
        }, true);
        assert.equal((await config.readAppConfig(transport('anon'))).config.api_config.crowd.intervalMs, 6000);
    });

    await check('Token validation and real authority lifecycle: create/use/edit/revoke/expire/delete', async () => {
        const tokenModulePath = require.resolve('../src/domain/predictions/apiAccess.ts');
        const serverConfigPath = require.resolve('../src/domain/predictions/serverConfig.ts');
        function verifier() {
            delete require.cache[tokenModulePath];
            delete require.cache[serverConfigPath];
            return require(tokenModulePath).verifyPredictionApiAccess;
        }
        const raw = `tt_isolated_${randomBytes(24).toString('hex')}`;
        const hash = createHash('sha256').update(raw).digest('hex');
        const edit = validateTokenEdit({ name: 'Isolated lifecycle', scopes: ['predictions:read'], allowedOrigins: ['https://client.invalid.test'], expiresAt: null }, true);
        assert.equal(edit.ok, true);
        for (const bad of [{ name: '' }, { name: 'Token', scopes: ['admin:all'] }, { name: 'Token', allowedOrigins: ['*'] }, { name: 'Token', expiresAt: '2000-01-01' }]) assert.equal(validateTokenEdit(bad, true).ok, false);
        const tokenId = await asRole('service_role', null, async db => {
            const insert = await db.query(`insert into public.api_tokens(name,token_hash,token_prefix,scopes,allowed_origins,created_by,updated_at)
                values ($1,$2,'tt_isolated',$3,$4,$5,'2099-01-01') returning id,updated_at`, [edit.value.name, hash, edit.value.scopes, edit.value.allowed_origins, ADMIN]);
            assert.ok(Math.abs(insert.rows[0].updated_at.getTime() - Date.now()) < 30000);
            await denied(db, "insert into public.api_tokens(name,token_hash,token_prefix) values ('duplicate',$1,'tt')", [hash], '23505');
            return insert.rows[0].id;
        }, true);
        const headers = new Headers({ authorization: `Bearer ${raw}`, origin: 'https://client.invalid.test' });
        const invoke = (verify, scope = 'predictions:read', requestHeaders = headers, env = {}) => verify({
            headers: requestHeaders, url: new URL('https://api.invalid.test/api/predictions'), requiredScope: scope,
            env: { NODE_ENV: 'production', TRAINTRACKS_PUBLIC_API_ORIGINS: 'https://client.invalid.test,https://other.invalid.test', ...env },
        });
        let verify = verifier();
        assert.equal((await invoke(verify)).ok, true);
        const used = (await owner.query('select token_hash,last_used_at from public.api_tokens where id=$1', [tokenId])).rows[0];
        assert.equal(used.token_hash, hash);
        assert.ok(used.last_used_at instanceof Date);
        assert.equal((await invoke(verify, 'incidents:write')).code, 'insufficient_scope');
        assert.equal((await invoke(verify, 'predictions:read', new Headers({ authorization: `Bearer ${raw}`, origin: 'https://other.invalid.test' }))).code, 'origin_not_allowed');
        await asRole('service_role', null, db => db.query('update public.api_tokens set scopes=$1 where id=$2', [['predictions:read', 'incidents:write'], tokenId]), true);
        assert.equal((await invoke(verify, 'incidents:write')).ok, true);
        await asRole('authenticated', ADMIN, db => db.query('update public.app_config set public_api_enabled=false where id=1'), true);
        verify = verifier();
        assert.equal((await invoke(verify)).code, 'public_api_disabled');
        assert.equal((await invoke(verify, 'predictions:read', headers, { TRAINTRACKS_PUBLIC_API_TOKENS: raw })).code, 'public_api_disabled');
        await asRole('authenticated', ADMIN, db => db.query('update public.app_config set public_api_enabled=true where id=1'), true);
        verify = verifier();
        await asRole('service_role', null, db => db.query('update public.api_tokens set is_active=false where id=$1', [tokenId]), true);
        assert.equal((await invoke(verify)).code, 'invalid_api_token');
        await asRole('service_role', null, db => db.query("update public.api_tokens set is_active=true,expires_at=now()-interval '1 second' where id=$1", [tokenId]), true);
        assert.equal((await invoke(verify)).code, 'invalid_api_token');
        await asRole('service_role', null, db => db.query('delete from public.api_tokens where id=$1', [tokenId]), true);
        assert.equal((await invoke(verify)).code, 'invalid_api_token');
        for (const id of [A, ADMIN]) await asRole('authenticated', id, async db => {
            await denied(db, "insert into public.api_tokens(name,token_hash,token_prefix) values ('forged','forged','tt')");
            await denied(db, 'update public.api_tokens set is_active=true');
        });
        return { transport: 'SQL adapter, actual application token/config policy', lastUsagePersisted: true };
    });

    const trip = { user_id: A, client_trip_id: 'stable-local-completion', origin_id: 'L2-01', origin_name: 'Recto', destination_id: 'L2-02', destination_name: 'Legarda',
        line_id: 'LRT2', destination_line_id: 'LRT2', ticket_type: 'SJT', fare: 8, distance_km: 1.25, direction: 'EASTBOUND', duration_minutes: 10,
        started_at: '2026-10-08T12:00:00.000Z', completed_at: '2026-10-08T12:10:00.000Z' };
    const validated = validateTrip(trip, A, trip.client_trip_id);
    const keys = validated.ok ? Object.keys(validated.value) : [];
    const insertTripSql = `insert into public.trip_history(${keys.join(',')}) values (${keys.map((_, index) => `$${index + 1}`).join(',')}) on conflict(user_id,client_trip_id) do nothing returning id,started_at,completed_at,fare`;
    const values = validated.ok ? Object.values(validated.value) : [];
    await check('History validates catalog/stable completion and rejects account-A replay under B', () => asRole('authenticated', B, async db => {
        assert.equal(validated.ok, true);
        assert.equal(validateTrip(trip, B, trip.client_trip_id).ok, false);
        assert.equal(validateTrip({ ...trip, completed_at: '2026-10-08T11:00:00.000Z' }, A, null).ok, false);
        await denied(db, insertTripSql, values);
        assert.equal((await db.query('select * from public.trip_history')).rowCount, 0);
        assert.equal((await db.query('update public.trip_history set fare=1 where user_id=$1', [A])).rowCount, 0);
    }));
    await check('20 concurrent history inserts yield one stable completion and authoritative owner totals', async () => {
        assert.equal(validated.ok, true);
        const workers = await Promise.all(Array.from({ length: 20 }, () => client('authenticated', A)));
        try {
            const inserted = await Promise.all(workers.map(db => db.query(insertTripSql, values)));
            assert.equal(inserted.reduce((sum, query) => sum + query.rowCount, 0), 1);
            const row = (await owner.query('select * from public.trip_history where client_trip_id=$1', [trip.client_trip_id])).rows[0];
            assert.equal(row.completed_at.toISOString(), trip.completed_at);
            assert.equal(row.started_at.toISOString(), trip.started_at);
            assert.equal(Number(row.fare), 8);
            const duplicateValues = [...values];
            duplicateValues[keys.indexOf('fare')] = 999;
            duplicateValues[keys.indexOf('completed_at')] = '2026-10-08T15:10:00Z';
            assert.equal((await workers[0].query(insertTripSql, duplicateValues)).rowCount, 0);
            assert.equal((await owner.query('select completed_at from public.trip_history where id=$1', [row.id])).rows[0].completed_at.toISOString(), trip.completed_at);
            const totals = (await workers[0].query('select * from public.trip_history_totals()')).rows[0];
            assert.equal(Number(totals.total_trips), 2);
            assert.equal(Number(totals.total_fare), 16);
            assert.equal(Number(totals.total_distance), 2.5);
            const page = (await workers[0].query('select client_trip_id from public.trip_history order by completed_at desc,id desc offset 1 limit 1')).rows;
            assert.equal(page.length, 1);
            return { clients: 20, inserted: 1, totals, paginationRows: page.length };
        } finally { await Promise.all(workers.map(close)); }
    });
    await check('History totals are owner-scoped for commuters/admin and unavailable to anon', async () => {
        report.totalsFunctionPrivileges = (await owner.query(`select
            has_function_privilege('anon','public.trip_history_totals()','execute') as anon_execute,
            has_function_privilege('authenticated','public.trip_history_totals()','execute') as authenticated_execute,
            proacl::text as acl from pg_proc where oid='public.trip_history_totals()'::regprocedure`)).rows[0];
        for (const id of [B, ADMIN]) await asRole('authenticated', id, async db => {
            assert.equal((await db.query('select * from public.trip_history')).rowCount, 0);
            assert.equal(Number((await db.query('select * from public.trip_history_totals()')).rows[0].total_trips), 0);
        });
        await asRole('anon', null, db => denied(db, 'select * from public.trip_history_totals()'));
    });

    await check('Crowd private tables/RPCs deny anon, commuter and authenticated admin', async () => {
        for (const [role, id] of [['anon', null], ['authenticated', A], ['authenticated', ADMIN]]) await asRole(role, id, async db => {
            for (const table of ['crowd_presence', 'crowd_presence_deliveries', 'crowd_incidents', 'stall_reports']) await denied(db, `select * from public.${table}`);
            await denied(db, recordSql, crowdArgs('forbidden', 'forbidden'));
            await denied(db, claimSql, [pseudonym('forbidden'), 'forbidden', new Date()]);
            await denied(db, markSql, [pseudonym('forbidden'), 'forbidden', new Date(), randomUUID()]);
        });
    });
    await check('20 real concurrent crowd clients produce one delivery claim and one visible observation', async () => {
        const workers = await Promise.all(Array.from({ length: 20 }, () => client('service_role')));
        const args = crowdArgs('race', 'race-one');
        try {
            const pids = await Promise.all(workers.map(async db => (await db.query('select pg_backend_pid() as pid')).rows[0].pid));
            assert.equal(new Set(pids).size, 20);
            const records = await Promise.all(workers.map(db => result(db, recordSql, args)));
            assert.ok(records.every(row => row.ok));
            assert.equal(records.filter(row => !row.duplicate).length, 1);
            const claims = await Promise.all(workers.map(db => result(db, claimSql, [args[0], args[11], new Date('2099-01-01')])));
            assert.equal(claims.filter(row => row.status === 'acquired').length, 1);
            assert.equal(claims.filter(row => row.status === 'claimed_elsewhere').length, 19);
            const claimedAt = (await workers[0].query('select claimed_at from public.crowd_presence_deliveries where pseudonym=$1 and sample_id=$2', [args[0], args[11]])).rows[0].claimed_at;
            assert.ok(Math.abs(claimedAt.getTime() - Date.now()) < 30000, 'Claim timestamp must come from the server, not the supplied 2099 timestamp.');
            const winner = claims.findIndex(row => row.status === 'acquired');
            await workers[winner].query('insert into smoke.realtime_observations(sample_id,payload) values ($1,$2)', [args[11], claims[winner].train]);
            assert.equal((await result(workers[winner], markSql, [args[0], args[11], new Date(), claims[winner].claim_token])).ok, true);
            const replays = await Promise.all(workers.map(db => result(db, recordSql, args)));
            assert.ok(replays.every(row => row.duplicate && row.broadcasted));
            const visible = (await owner.query('select count(*)::int as n from smoke.realtime_observations where sample_id=$1', [args[11]])).rows[0].n;
            assert.equal(visible, 1);
            assert.equal((await owner.query('select count(*)::int as n from public.crowd_presence_deliveries where sample_id=$1', [args[11]])).rows[0].n, 1);
            return { clients: 20, distinctBackends: pids.length, freshRecords: 1, acquiredClaims: 1, visibleObservations: visible, transport: 'stub, not Supabase websocket' };
        } finally { await Promise.all(workers.map(close)); }
    });
    await check('Crowd expired claims are fenced; release/retry and immutable old-sample payloads work', async () => {
        const db = await client('service_role');
        try {
            const args = crowdArgs('fence', 'fence-old', new Date(Date.now() - 8000));
            assert.equal((await result(db, recordSql, args)).ok, true);
            const first = await result(db, claimSql, [args[0], args[11], new Date()]);
            assert.equal(first.status, 'acquired');
            await db.query("update public.crowd_presence_deliveries set claimed_at=clock_timestamp()-interval '31 seconds' where pseudonym=$1 and sample_id=$2", [args[0], args[11]]);
            const next = await result(db, claimSql, [args[0], args[11], new Date()]);
            assert.equal(next.status, 'acquired');
            assert.notEqual(next.claim_token, first.claim_token);
            await result(db, releaseSql, [args[0], args[11], first.claim_token]);
            assert.equal((await result(db, markSql, [args[0], args[11], new Date(), first.claim_token])).ok, false);
            assert.equal((await db.query('select claim_token from public.crowd_presence_deliveries where pseudonym=$1 and sample_id=$2', [args[0], args[11]])).rows[0].claim_token, next.claim_token);
            await result(db, releaseSql, [args[0], args[11], next.claim_token]);
            const retried = await result(db, claimSql, [args[0], args[11], new Date()]);
            assert.equal(retried.status, 'acquired');
            const newerArgs = crowdArgs('fence', 'fence-new');
            assert.equal((await result(db, recordSql, newerArgs)).ok, true);
            assert.equal(retried.train.sampleId, 'fence-old');
            assert.equal((await result(db, markSql, [args[0], args[11], new Date(), retried.claim_token])).ok, true);
            const latest = (await db.query('select sample_id,broadcast_sample_id from public.crowd_presence where pseudonym=$1', [args[0]])).rows[0];
            assert.equal(latest.sample_id, 'fence-new');
            assert.equal(latest.broadcast_sample_id, null);
            const stale = crowdArgs('stale', 'stale-one', new Date(Date.now() - 60000));
            assert.equal((await result(db, recordSql, stale)).code, 'stale_sample');
            await db.query("update public.crowd_presence_deliveries set expires_at=clock_timestamp()-interval '1 second' where pseudonym=$1 and sample_id=$2", [args[0], newerArgs[11]]);
            assert.equal((await result(db, claimSql, [args[0], newerArgs[11], new Date()])).status, 'sample_expired');
        } finally { await close(db); }
    });
    await check('Stall RPC aggregates distinct reporters, deduplicates and binds report ownership', async () => {
        const db = await client('service_role');
        const sql = 'select public.record_stall_report($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) as result';
        const args = ['stall-one', pseudonym('stall-a'), 'LRT2', 14.603, 120.983, 'L2-01', 'Recto', 0.1, 'warning', 'stall', 'Synthetic local test', 5, new Date()];
        try {
            const first = await result(db, sql, args);
            assert.equal(first.ok, true);
            assert.equal((await result(db, sql, args)).duplicate, true);
            assert.equal((await result(db, sql, [args[0], pseudonym('foreign'), ...args.slice(2)])).code, 'report_owner_mismatch');
            const others = [2, 3].map(index => [`stall-${index}`, pseudonym(`stall-${index}`), ...args.slice(2)]);
            for (const other of others) assert.equal((await result(db, sql, other)).ok, true);
            const count = (await db.query('select count(*)::int as n from public.stall_reports where incident_id=$1', [first.incident.id])).rows[0].n;
            assert.equal(count, 3);
            assert.equal((await result(db, sql, ['stall-rate', args[1], ...args.slice(2)])).code, 'rate_limited');
            const invalid = ['stall-invalid', pseudonym('invalid'), ...args.slice(2)];
            invalid[11] = 1;
            assert.equal((await result(db, sql, invalid)).code, 'invalid_report');
        } finally { await close(db); }
    });
}

async function stopPostgres() {
    await Promise.all([...clients].map(db => close(db).catch(error => logs.push(error.message))));
    if (owner) { await owner.end(); owner = null; }
    if (!embedded?.process) return;
    // pg_ctl performs a clean, fast shutdown of this exact freshly-created cluster.
    const binaryPackage = await import(pathToFileURL(isolatedRequire.resolve(`@embedded-postgres/${process.platform === 'win32' ? 'windows' : process.platform}-${process.arch}`)).href);
    const child = embedded.process;
    await new Promise((resolve, reject) => {
        const stopper = spawn(binaryPackage.pg_ctl, ['-D', path.join(runDir, 'data'), '-m', 'fast', '-w', 'stop'], { windowsHide: true });
        stopper.stdout.on('data', data => logs.push(data.toString()));
        stopper.stderr.on('data', data => logs.push(data.toString()));
        stopper.once('error', reject);
        stopper.once('exit', code => code === 0 ? resolve() : reject(new Error(`pg_ctl shutdown failed: ${code}`)));
    }).catch(async error => { logs.push(error.message); await embedded.stop(); });
    if (child.exitCode === null) await new Promise(resolve => child.once('exit', resolve));
    embedded.process = undefined;
    const open = await new Promise(resolve => {
        const socket = net.connect({ host: '127.0.0.1', port: report.port });
        socket.once('connect', () => { socket.destroy(); resolve(true); });
        socket.once('error', () => resolve(false));
        socket.setTimeout(1000, () => { socket.destroy(); resolve(false); });
    });
    assert.equal(open, false, 'Local PostgreSQL port still accepts connections after cleanup.');
    report.postgresStopped = true;
}

if (!exitRequested) {
    try {
        const { default: EmbeddedPostgres } = await import(pathToFileURL(isolatedRequire.resolve('embedded-postgres')).href);
        const { Client } = isolatedRequire('pg');
        const port = await unusedPort();
        report.port = port;
        runDir = path.join(prefix, 'runs', `${Date.now()}-${randomUUID()}`);
        fs.mkdirSync(runDir, { recursive: true });
        report.runDirectory = runDir;
        connection = { host: '127.0.0.1', port, user: 'postgres', password: randomBytes(32).toString('hex'), database: 'postgres', connectionTimeoutMillis: 10000 };
        embedded = new EmbeddedPostgres({ databaseDir: path.join(runDir, 'data'), user: connection.user, password: connection.password, port,
            persistent: true, createPostgresUser: false, authMethod: 'scram-sha-256', initdbFlags: ['--encoding=UTF8'],
            postgresFlags: ['-h', '127.0.0.1', '-c', 'max_connections=60'], onLog: message => logs.push(String(message)), onError: message => logs.push(String(message)) });
        await embedded.initialise();
        await embedded.start();
        owner = new Client(connection);
        await owner.connect();
        report.postgresVersion = (await owner.query('select version() as version')).rows[0].version;
        assert.equal((await owner.query('show listen_addresses')).rows[0].listen_addresses, '127.0.0.1');
        report.postgresPid = embedded.process.pid;
        console.log(`${report.postgresVersion}\nLocal-only listener: 127.0.0.1:${port}; PID ${report.postgresPid}\nRun directory: ${runDir}`);
        await exercise();
    } catch (error) {
        report.fatal = { message: error.message, code: error.code ?? null, stack: error.stack };
        console.error(error.stack);
    } finally {
        try { await stopPostgres(); } catch (error) { report.cleanupError = error.message; console.error(error); }
        Module._resolveFilename = originalResolve;
        Module._load = originalLoad;
        report.finishedAt = new Date().toISOString();
        report.passed = report.cases.filter(item => item.status === 'pass').length;
        report.failed = report.cases.filter(item => item.status === 'fail').length;
        if (runDir) {
            fs.writeFileSync(path.join(runDir, 'postgres.log'), logs.join('\n'));
            fs.writeFileSync(path.join(runDir, 'report.json'), JSON.stringify(report, null, 2));
            fs.writeFileSync(path.join(prefix, 'latest-report.json'), JSON.stringify(report, null, 2));
        }
        console.log(`DB checks: ${report.passed} passed, ${report.failed} failed; PostgreSQL stopped: ${report.postgresStopped === true}.`);
        if (runDir) console.log(`Report: ${path.join(runDir, 'report.json')}`);
        if (report.fatal || report.cleanupError || report.failed) process.exitCode = 1;
    }
    // embedded-postgres's beforeExit hook otherwise replaces a nonzero exitCode.
    process.exit(process.exitCode ?? 0);
}
