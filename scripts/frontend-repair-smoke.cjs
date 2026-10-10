const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const os = require('node:os');
const root = path.resolve(__dirname, '..');
const ts = require('typescript');
const resolve = Module._resolveFilename;
Module._resolveFilename = function(request, parent, isMain, options) {
    return resolve.call(this, request.startsWith('@/') ? path.join(root, 'src', request.slice(2)) : request, parent, isMain, options);
};
for (const extension of ['.ts', '.tsx']) Module._extensions[extension] = (module, filename) => {
    module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
        esModuleInterop: true, jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019,
    } }).outputText, filename);
};
const requireApp = name => require(path.join(root, name));
global.React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { platformTrains, platformEmptyMessage, formatForecastEta } = requireApp('src/components/platformForecasts.ts');
const { useTripStore } = requireApp('src/store/useTripStore.ts');
useTripStore.getInitialState = () => useTripStore.getState();
require.cache[require.resolve('../src/store/useTripStore.ts')].exports.useTripStore = Object.assign(selector => selector ? selector(useTripStore.getState()) : useTripStore.getState(), useTripStore);
const { createJourneySnapshot, reduceJourneySnapshot, getJourneyEntryDirection } = requireApp('src/domain/journey/engine.ts');
const { getJourneyRailEdgePath } = requireApp('src/domain/journey/geometry.ts');
const { getPolylineLengthMeters, interpolatePolyline } = requireApp('src/domain/location/polyline.ts');
const { buildJourneyTripLogicView } = requireApp('src/hooks/useTripLogic.ts');
const { getFareBreakdown } = requireApp('src/utils/fareNew.ts');
const { parseActiveTripCheckpoint } = requireApp('src/domain/offline/tripCheckpoint.ts');
const { buildJourneyRoute } = requireApp('src/domain/journey/routeBuilder.ts');
const { STATIONS } = requireApp('src/data/stations.ts');
const { readSafetyDismissals, persistSafetyDismissals, MAX_SAFETY_DISMISSAL_TRIPS, SAFETY_DISMISSALS_KEY } = requireApp('src/components/screens/safetyReminderDismissals.ts');
let storedDismissals = null;
const dismissalStorage = { getItem: () => storedDismissals, setItem: (_key, value) => { storedDismissals = value; } };
for (let i = 0; i < 25; i++) persistSafetyDismissals(`safety-${i}`, { PRE_BOARD: true, IN_TRANSIT: i === 24 }, dismissalStorage);
assert.equal(JSON.parse(storedDismissals).length, MAX_SAFETY_DISMISSAL_TRIPS);
assert.deepEqual(readSafetyDismissals('safety-24', dismissalStorage), { PRE_BOARD: true, IN_TRANSIT: true });
assert.deepEqual(readSafetyDismissals('safety-0', dismissalStorage), { PRE_BOARD: false, IN_TRANSIT: false });
storedDismissals = '{bad-json';
assert.deepEqual(readSafetyDismissals('safety-24', dismissalStorage), { PRE_BOARD: false, IN_TRANSIT: false });
console.log('Safety dismissal regressions passed: trip identity, both flags, 20-entry bound, corrupt storage fallback.');
const { TripProgress } = requireApp('src/components/TripProgress.tsx');
const { TicketCard } = requireApp('src/components/TicketCard.tsx');
const { useTrainStore } = requireApp('src/store/useTrainStore.ts');
require.cache[require.resolve('../src/store/useTrainStore.ts')].exports.useTrainStore = Object.assign(selector => selector(useTrainStore.getState()), useTrainStore);
const { UpcomingTrainsCard } = requireApp('src/components/UpcomingTrainsCard.tsx');
const { SpectatorInfoCard } = requireApp('src/components/SpectatorInfoCard.tsx');
const station = id => STATIONS.find(s => s.id === id);
const now = Date.now();
const origin = station('L1-20');
const target = station('L1-19');
const forecast = { id: 'forecast', dispatchId: 'dispatch', predictionScope: 'station', source: 'predicted', lineId: 'LRT1', direction: 'SOUTHBOUND', stationId: origin.id, stationName: origin.name, lat: origin.latitude, lng: origin.longitude, statusCode: 'IN_TRANSIT', updatedAt: now, validUntil: now + 100000, arrivalTime: new Date(now + 480000).toISOString(), departureTime: new Date(now + 510000).toISOString(), etaSeconds: 480, etaWindowSeconds: 30, confidence: .6, freshness: 'fresh', speedKph: 0 };
const map = { ...forecast, id: 'map', predictionScope: 'map' };
const crowd = { ...forecast, id: 'crowd', dispatchId: undefined, predictionScope: undefined, source: 'crowd', statusCode: 'AT_STATION' };
const lines = STATIONS.filter(s => s.lineId === 'LRT1');
assert.deepEqual(platformTrains([map, crowd], [forecast, forecast], origin, lines, 'SOUTHBOUND', now).map(t => t.id), ['crowd', 'forecast']);
assert.match(formatForecastEta(forecast), /Forecast.*min/);
assert.equal(platformEmptyMessage('error', 'Estimates unavailable', [], origin.id), 'Estimates unavailable');
assert.match(platformEmptyMessage('offline', null, [], origin.id), /Offline/);
assert.match(platformEmptyMessage('fresh', null, [{ key: `scope=station&stationId=${origin.id}`, response: { serviceState: 'service_closed' } }], origin.id), /ended/);
useTripStore.setState({ origin, destination: target, currentStation: origin, ticketType: 'SJT', status: 'WAITING', journeySnapshot: createJourneySnapshot(buildJourneyRoute(origin, target)) });
let markup = renderToStaticMarkup(React.createElement(TripProgress, { origin, destination: target, current: origin, next: target, prev: null, progress: 20, totalProgress: 10, runningFare: 0, ticketType: 'SJT', distanceToNext: 0, distanceToDest: 1000 }));
assert.match(markup, /Next Station/);
assert.match(markup, /0m/);
assert.match(markup, /Fare So Far/);
assert.match(markup, /role="progressbar"/);
assert.match(markup, /aria-valuenow="10"/);
useTripStore.setState({ direction: 'SOUTHBOUND' });
useTrainStore.setState({ trains: [crowd, map], stationForecasts: [forecast], predictionState: 'fresh', selectedStationCode: origin.id, selectedTrainId: null });
markup = renderToStaticMarkup(React.createElement(UpcomingTrainsCard));
assert.match(markup, /platform forecast/);
assert.match(markup, /Forecast/);
assert.ok(markup.indexOf('Crowdsourced') < markup.indexOf('platform forecast'));
markup = renderToStaticMarkup(React.createElement(SpectatorInfoCard));
assert.match(markup, /platform forecast/);
assert.match(markup, /1 confirmed \/ 1 expected/);
const snapshot = { ...useTripStore.getState().journeySnapshot, tripId: 'receipt', startedAt: now - 420000, completedAt: now, completedDistanceMeters: 2750, phase: 'ARRIVED', statusCode: 'ARRIVED' };
useTripStore.setState({ status: 'ARRIVED', journeySnapshot: snapshot });
markup = renderToStaticMarkup(React.createElement(TicketCard, { origin, ticketType: 'SJT', direction: 'SOUTHBOUND', runningFare: 23, onTicketClick() {} }));
assert.match(markup, /2\.8km/);
assert.match(markup, />7<span/);
useTripStore.getState().retainCompletedTrip({ ownerId: 'owner-a', client_trip_id: 'receipt' });
useTripStore.getState().setHistorySaveFailure('Quota fixture');
markup = renderToStaticMarkup(React.createElement(TicketCard, { origin, ticketType: 'SJT', direction: 'SOUTHBOUND', runningFare: 23, onTicketClick() {} }));
assert.match(markup, /History not queued; receipt retained/);
assert.match(markup, /disabled=""/);
useTripStore.getState().reset();
assert.equal(useTripStore.getState().status, 'ARRIVED');
useTripStore.getState().discardCompletedTrip();
useTripStore.setState({ computedRoute: [origin, target] });
markup = renderToStaticMarkup(React.createElement(TicketCard, { origin, ticketType: 'CONCESSION', direction: 'SOUTHBOUND', runningFare: 23, onTicketClick() {} }));
assert.match(markup, /Unverified Fare/);
assert.match(markup, /title="[^"]+"/);
useTripStore.setState({ status: 'WAITING', destination: origin, computedRoute: [origin, target, origin] });
markup = renderToStaticMarkup(React.createElement(TripProgress, { origin, destination: origin, current: target, next: origin, prev: null, progress: 50, totalProgress: 50, runningFare: 0, ticketType: 'SJT', distanceToNext: 1000, distanceToDest: 1000 }));
const sameLineFareWarningAbsent = !/Unverified/.test(markup) || !/confirm the ticket rules with the operator/.test(markup);
if (sameLineFareWarningAbsent) console.log('KNOWN APP GAP: same-line reversed quote does not expose its unverified operator-confirmation warning.');
const reversedCrossLine = [origin, target, ...buildJourneyRoute(origin, station('M3-13')).stationIds.map(station)];
useTripStore.setState({ computedRoute: reversedCrossLine, destination: station('M3-13') });
markup = renderToStaticMarkup(React.createElement(TripProgress, { origin, destination: station('M3-13'), current: target, next: origin, prev: null, progress: 50, totalProgress: 50, runningFare: 0, ticketType: 'SJT', distanceToNext: 1000, distanceToDest: 1000 }));
assert.match(markup, /Quoted Total \(Unverified\)/);
assert.match(markup, /title="[^"]*confirm the ticket rules with the operator/);
useTripStore.setState({ status: 'ARRIVED' });
markup = renderToStaticMarkup(React.createElement(TicketCard, { origin, ticketType: 'SJT', direction: 'SOUTHBOUND', runningFare: 0, onTicketClick() {} }));
assert.match(markup, /Unverified Fare/);
assert.match(markup, /title="[^"]*confirm the ticket rules with the operator/);
console.log('UI render/platform regressions passed: forecast deduplication/priority, state labels, zero distance, progress semantics, measured receipt.');

async function pwaGateChecks() {
    const harness = ts.createSourceFile('frontend-repair-smoke.cjs', fs.readFileSync(__filename, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    let workerNode;
    const findWorker = node => { if (ts.isFunctionDeclaration(node) && node.name?.text === 'workerFixture') workerNode = node; ts.forEachChild(node, findWorker); };
    findWorker(harness);
    assert.ok(workerNode);
    const workerSandbox = { navigator: { serviceWorker: {} }, location: { href: 'http://127.0.0.1:3000/' }, URL, Event, EventTarget };
    workerSandbox.window = workerSandbox;
    require('node:vm').runInNewContext('(' + ts.createPrinter().printNode(ts.EmitHint.Unspecified, workerNode, harness) + ')()', workerSandbox);
    const registration = workerSandbox.__pwaRegistration;
    assert.equal(await workerSandbox.navigator.serviceWorker.register(), registration);
    assert.equal(await workerSandbox.navigator.serviceWorker.ready, registration);
    const lifecycle = [];
    registration.addEventListener('updatefound', event => {
        assert.equal(event.target, registration);
        assert.equal(registration.installing.state, 'installing');
        assert.match(registration.installing.scriptURL, /\/sw\.js$/);
        assert.equal(registration.waiting, null);
        lifecycle.push('installing');
        registration.installing.addEventListener('statechange', event => {
            assert.equal(event.target, registration.waiting);
            assert.equal(registration.waiting.state, 'installed');
            assert.equal(registration.installing, null);
            lifecycle.push('waiting');
        });
    });
    workerSandbox.__stageWaitingWorker();
    assert.deepEqual(lifecycle, ['installing', 'waiting']);
    assert.equal(workerSandbox.__pwaMessages.length, 0);
    console.log('Worker fixture regressions passed: registration/ready and installing -> waiting event targets, no implicit activation.');
    const source = ts.createSourceFile('MainApp.tsx', fs.readFileSync(path.join(root, 'src/components/MainApp.tsx'), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let selector;
    const find = node => {
        if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'canActivateUpdate') selector = node.initializer.arguments[0];
        ts.forEachChild(node, find);
    };
    find(source);
    assert.ok(selector, 'MainApp activation selector must remain covered');
    const gateModule = { exports: {} };
    const printed = ts.createPrinter().printNode(ts.EmitHint.Expression, selector, source);
    require('node:vm').runInNewContext(ts.transpileModule('module.exports = ' + printed, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { module: gateModule });
    const canActivate = gateModule.exports;
    const authId = require.resolve('../src/hooks/useAuth.ts');
    const previousAuth = require.cache[authId];
    const authFixture = new Module(authId);
    authFixture.exports = { useAuth: () => ({ user: null, loading: false }) };
    authFixture.loaded = true;
    require.cache[authId] = authFixture;
    const { activatePwaUpdate } = requireApp('src/hooks/useOfflineRuntime.ts');
    if (previousAuth) require.cache[authId] = previousAuth; else delete require.cache[authId];
    const messages = [];
    const updateRegistration = { waiting: { postMessage: message => messages.push(message) } };
    const state = { persistenceHydrated: false, status: 'IDLE', origin: null, pendingTripRecovery: null, pendingCompletedTrip: null };
    assert.equal(await activatePwaUpdate(updateRegistration, () => canActivate(state)), false);
    assert.equal(messages.length, 0, 'No SKIP_WAITING before hydration');
    state.persistenceHydrated = true;
    state.pendingTripRecovery = { journeySnapshot: snapshot };
    assert.equal(await activatePwaUpdate(updateRegistration, () => canActivate(state)), false);
    assert.equal(messages.length, 0, 'Pending recovery retains its journey');
    state.pendingTripRecovery = null;
    const navigator = global.navigator ?? {};
    const previousLocks = Object.getOwnPropertyDescriptor(navigator, 'locks');
    const previousNavigator = Object.getOwnPropertyDescriptor(global, 'navigator');
    Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: async (_name, _options, action) => action({}) } });
    Object.defineProperty(global, 'navigator', { configurable: true, value: navigator });
    try {
        assert.equal(await activatePwaUpdate(updateRegistration, () => canActivate(state)), true);
        assert.deepEqual(messages, [{ type: 'SKIP_WAITING' }]);
    } finally {
        if (previousLocks) Object.defineProperty(navigator, 'locks', previousLocks); else delete navigator.locks;
        if (previousNavigator) Object.defineProperty(global, 'navigator', previousNavigator); else delete global.navigator;
    }
    console.log('MainApp PWA gate/helper regressions passed: waiting worker blocked before hydration and during recovery; hydrated idle activates. Browser mounting remains separately checked.');
}

const BASE_URL = process.env.FRONTEND_REPAIR_URL || 'http://127.0.0.1:3100';
if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(BASE_URL).hostname)) throw new Error('Use a local QA server only.');
const ONLY_PHASE = process.env.FRONTEND_REPAIR_PHASE;
if (ONLY_PHASE && !['raw GPS four-state', 'simulator playback'].includes(ONLY_PHASE)) throw new Error('Unknown selected frontend phase.');
const OUTPUT = path.resolve(__dirname, ONLY_PHASE ? `../.tmp-edge-debug/repair-20261009/${ONLY_PHASE === 'simulator playback' ? 'simulator' : 'raw-gps'}` : '../.tmp-edge-debug/repair-20261009');
fs.mkdirSync(OUTPUT, { recursive: true });
async function browserChecks() {
    let playwright;
    if (process.env.PLAYWRIGHT_MODULE_PATH) playwright = require(process.env.PLAYWRIGHT_MODULE_PATH);
    else {
        try { playwright = require('playwright'); }
        catch { playwright = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
    }
    const executablePath = process.env.PLAYWRIGHT_CHROME_PATH || (process.platform === 'win32'
        ? path.join(process.env.ProgramFiles || 'C:/Program Files', 'Google/Chrome/Application/chrome.exe') : undefined);
    const browser = await playwright.chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
    const production = process.env.FRONTEND_REPAIR_PRODUCTION === '1';
    const output = { baseUrl: BASE_URL, runMode: production ? 'production' : 'development', selectedPhase: ONLY_PHASE ?? null, checkedAt: new Date().toISOString(), checks: [], errors: [], screenshots: [], blockedWrites: [], states: [], profiles: [], pending: [
        'Local production bundle: parent owns final build; rerun with FRONTEND_REPAIR_URL against a parent-provided webpack production server.',
        'New Fable controls: recovery confirmation, explicit compass permission, uncertain-GPS manual transfer, retry/discard receipt, forecast/history/config retry and PWA update control are intentionally not implemented.',
        'Phone/cookie/security gates are production-only; dev bypass is tested, actual production gate mounting remains pending.',
        'Dormant/unmounted components are not certified by source or isolated rendering. All 24 cards are not claimed mounted/passed.',
        'Signed-in profile/drawer/history pagination, account switching, reset-password and auth/API owner workflows need their isolated owner fixtures.',
        'Real GPS coordinates/accuracy, sensor conventions, iOS compass permission, screen lock/background alerts, OS eviction, PWA installation/update and assistive technology require hardware QA.',
        'Visual screenshots are inspection evidence, not whole-product pixel-diff certification; all overlay combinations, long text and every GeoJSON viewport are not exhausted.',
        'Physical touch pinch/rotation/low-end thermal and memory behavior cannot be certified by headless desktop Chrome.',
    ].filter(item => !production || !item.startsWith('Local production bundle:') && !item.startsWith('Phone/cookie/security gates')) };
    if (ONLY_PHASE) output.pending.push('Selected-phase replay only, not the full frontend matrix. See the separate complete production results.');
    const check = (name, pass, detail) => { output.checks.push({ name, pass: Boolean(pass), detail }); if (!pass) console.log('FAILED: ' + name); };
    try {
        const browserCdp = await browser.newBrowserCDPSession();
        const { gpu } = await browserCdp.send('SystemInfo.getInfo');
        output.graphics = { devices: gpu.devices, renderer: gpu.auxAttributes?.glRenderer, vendor: gpu.auxAttributes?.glVendor, featureStatus: gpu.featureStatus };
        await browserCdp.detach();
    } catch (error) { output.graphics = { unavailable: error.message }; }
    const phase = async (name, run) => { if (ONLY_PHASE && !name.includes(ONLY_PHASE)) return; console.log('Phase: ' + name); try { await run(); } catch (error) { check(name, false, error.stack); } finally { fs.writeFileSync(path.join(OUTPUT, 'results-running.json'), JSON.stringify(output, null, 2)); } };
    const tileCache = new Map();
    let predictionFixture = true;
    function clockFixture() {
        const RealDate = Date;
        const base = RealDate.parse('2026-10-09T02:00:00Z');
        let offset = Number(sessionStorage.getItem('repair-clock-offset') ?? (base - RealDate.now()));
        sessionStorage.setItem('repair-clock-offset', String(offset));
        const time = () => Math.round(RealDate.now() + offset);
        window.__advanceTime = ms => { offset += ms; sessionStorage.setItem('repair-clock-offset', String(offset)); };
        window.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : [time()])); } static now() { return time(); } };
    }
    function workerFixture() {
        if (!navigator.serviceWorker) return;
        window.__pwaMessages = [];
        window.__notifications = [];
        window.__pwaRegistration = Object.assign(new EventTarget(), {
            waiting: null, active: null, installing: null, scope: new URL('/', location.href).href,
            update: async () => window.__pwaRegistration,
            unregister: async () => true,
            showNotification: async (title, options) => { window.__notifications.push({ title, options }); },
        });
        navigator.serviceWorker.register = async () => window.__pwaRegistration;
        navigator.serviceWorker.getRegistration = async () => window.__pwaRegistration;
        Object.defineProperty(navigator.serviceWorker, 'ready', { configurable: true, get: () => Promise.resolve(window.__pwaRegistration) });
        window.__stageWaitingWorker = () => {
            const worker = Object.assign(new EventTarget(), { scriptURL: new URL('/sw.js', location.href).href, state: 'installing', postMessage: message => __pwaMessages.push(message) });
            __pwaRegistration.installing = worker;
            __pwaRegistration.dispatchEvent(new Event('updatefound'));
            __pwaRegistration.waiting = worker;
            __pwaRegistration.installing = null;
            worker.state = 'installed';
            worker.dispatchEvent(new Event('statechange'));
        };
    }
    try {
        const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, timezoneId: 'Asia/Manila', userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36' });
        await context.addInitScript(clockFixture);
        await context.addInitScript(workerFixture);
        const routeHandler = async route => {
            const req = route.request(), url = new URL(req.url());
            if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method())) { output.blockedWrites.push({ method: req.method(), url: url.origin + url.pathname }); return route.abort(); }
            if (url.pathname === '/api/predictions') {
                const clock = await req.frame().evaluate(() => Date.now()).catch(() => null);
                if (clock === null) return route.abort().catch(() => {});
                const scope = url.searchParams.get('scope') ?? 'map';
                const stop = station(url.searchParams.get('stationId')) ?? station('L1-02');
                const predictions = predictionFixture ? [{ id: `repair-http-${scope}-${stop.id}`, dispatchId: `fixture-${stop.id}`, predictionScope: scope, source: 'predicted', lineId: stop.lineId, direction: url.searchParams.get('direction') ?? 'NORTHBOUND', stationId: stop.id, stationName: stop.name, lat: stop.latitude, lng: stop.longitude, statusCode: scope === 'station' ? 'AT_STATION' : 'IN_TRANSIT', updatedAt: clock, validUntil: clock + 60000, arrivalTime: new Date(clock + 120000).toISOString(), departureTime: new Date(clock + 150000).toISOString(), etaSeconds: 120, confidence: .6, speedKph: 0, provenance: { category: 'schedule_model', realtimeVehicleFeed: false } }] : [];
                return route.fulfill({ json: { generatedAt: new Date(clock).toISOString(), validUntil: new Date(clock + 60000).toISOString(), timezone: 'Asia/Manila', dayType: 'weekday', serviceState: 'active', sourceVersion: 'repair-http-response', provenance: { category: 'schedule_model', realtimeVehicleFeed: false, inputs: [], sourceRefs: [] }, predictions } });
            }
            if (url.pathname === '/api/incidents' || url.pathname === '/api/crowd/presence') return route.fulfill({ json: { incidents: [], trains: [] } });
            if (/supabase/.test(url.hostname)) return route.fulfill({ status: url.pathname.includes('/auth/') ? 401 : 200, json: url.pathname.includes('/auth/') ? { message: 'No isolated session' } : [{ maintenance_mode: false, congestion_config: null }] });
            if (url.pathname.startsWith('/api/map-tiles/')) {
                try {
                    if (!tileCache.has(url.pathname)) { const res = await fetch('https://traintracks.vercel.app' + url.pathname, { signal: AbortSignal.timeout(6000) }); tileCache.set(url.pathname, { status: res.status, contentType: 'image/png', body: Buffer.from(await res.arrayBuffer()) }); }
                    return route.fulfill(tileCache.get(url.pathname));
                } catch { return route.abort(); }
            }
            if (url.origin !== new URL(BASE_URL).origin && !['data:', 'blob:'].includes(url.protocol)) return route.abort();
            return route.continue();
        };
        await context.route('**/*', routeHandler);
        await context.addInitScript(initial => {
            localStorage.setItem('traintracks_welcome_seen', 'true');
            window.__compassRequests = 0;
            if (window.DeviceOrientationEvent) DeviceOrientationEvent.requestPermission = async () => { window.__compassRequests++; return 'denied'; };
            let current = initial, speed = 0, id = 0;
            const watchers = new Map();
            const fix = () => ({ coords: { latitude: current.latitude, longitude: current.longitude, accuracy: 5, speed: speed / 3.6, heading: null, altitude: null, altitudeAccuracy: null }, timestamp: Date.now() });
            window.__gpsQuiet = false;
            navigator.geolocation.getCurrentPosition = success => { if (!window.__gpsQuiet) success(fix()); };
            navigator.geolocation.watchPosition = success => { watchers.set(++id, success); if (!window.__gpsQuiet) success(fix()); return id; };
            navigator.geolocation.clearWatch = id => watchers.delete(id);
            window.__gps = (point, kph = 0) => { current = point; speed = kph; if (!window.__gpsQuiet) for (const success of watchers.values()) success(fix()); };
            window.__notifications = [];
            window.Notification = class { static permission = 'granted'; constructor(title, options) { __notifications.push({ title, options }); } };
            try { ServiceWorkerRegistration.prototype.showNotification = async (title, options) => { __notifications.push({ title, options }); }; } catch {}
            window.__longTasks = [];
            try { new PerformanceObserver(list => __longTasks.push(...list.getEntries().map(entry => entry.duration))).observe({ entryTypes: ['longtask'] }); } catch {}
        }, station('L1-02'));
        const page = await context.newPage();
        page.setDefaultTimeout(20000);
        page.on('pageerror', error => output.errors.push(error.stack || error.message));
        await page.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded', timeout: 120000 });
        await page.getByRole('button', { name: 'Settings Menu' }).waitFor({ timeout: 120000 });
        await page.waitForTimeout(1000);
        await page.evaluate(initial => { window.__keepGpsFresh = setInterval(() => __gps(initial), 1000); }, station('L1-02'));
        async function exposeStores() { await page.evaluate(() => {
            let runtime; webpackChunk_N_E.push([[Date.now()], {}, r => runtime = r]);
            for (const [id, factory] of Object.entries(runtime.m)) {
                if (!/resumePendingTrip|setLocationRuntime|setPredictedTrains/.test(factory.toString())) continue;
                try { for (const value of Object.values(runtime(id))) if (value?.getState) { const state = value.getState(); if (state.journeySnapshot) window.__trip = value; if ('sample' in state) window.__loc = value; if ('rawTrains' in state) window.__fleet = value; } } catch {}
            }
        }); }
        await exposeStores();
        check('store fixture access', await page.evaluate(() => Boolean(window.__trip && window.__fleet)));
        check('same-line unverified quote exposes operator-confirmation warning', !sameLineFareWarningAbsent, 'Isolated render of preserved L1-20 -> L1-19 -> L1-20 route; existing quote block is cross-line only.');
        await phase('simulator playback through mounted controls', async () => {
            await page.evaluate(() => {
                clearInterval(window.__keepGpsFresh);
                __trip.getState().discardCompletedTrip();
                __trip.getState().reset();
                __trip.setState({ isDevMode: true, isGpsOverride: false });
                window.__simulationUpdates = 0;
                window.__stopCountingSimulation = __trip.subscribe(() => { window.__simulationUpdates++; });
            });
            await page.getByRole('button', { name: 'LRT-2 EB', exact: true }).click();
            await page.waitForTimeout(5500);
            const state = await page.evaluate(() => {
                const s = __trip.getState();
                return { phase: s.journeySnapshot.phase, tripId: s.journeySnapshot.tripId,
                    lastSampleAt: s.journeySnapshot.lastSampleAt, timestamp: s.simulatedTimestamp,
                    effective: __loc.getState().sample, updates: __simulationUpdates,
                    body: document.body.innerText, simulated: s.simulatedLocation };
            });
            check('mounted simulator starts without maximum update depth error', !state.body.includes('Something went wrong') && output.errors.length === 0, { phase: state.phase, updates: state.updates });
            check('simulator input is timestamped once and shared with the journey/effective sample', state.timestamp > 0 && state.lastSampleAt === state.timestamp && state.effective?.source === 'simulation' && state.effective?.timestamp === state.timestamp, state);
            const simulationOrigin = station('L2-01');
            check('simulator advances with bounded updates', state.simulated && state.updates > 0 && state.updates < 200
                && (Math.abs(state.simulated.latitude - simulationOrigin.latitude) > 1e-8 || Math.abs(state.simulated.longitude - simulationOrigin.longitude) > 1e-8), { updates: state.updates, simulated: state.simulated });
            await page.screenshot({ path: path.join(OUTPUT, 'simulator-playing-390.png') });
            output.screenshots.push('simulator-playing-390.png');
            await page.getByRole('button', { name: 'Pause simulation', exact: true }).click();
            const paused = await page.evaluate(() => ({ location: __trip.getState().simulatedLocation, timestamp: __trip.getState().simulatedTimestamp, tripId: __trip.getState().journeySnapshot.tripId }));
            await page.waitForTimeout(2300);
            const resting = await page.evaluate(() => ({ location: __trip.getState().simulatedLocation, timestamp: __trip.getState().simulatedTimestamp, sampleAt: __trip.getState().journeySnapshot.lastSampleAt }));
            check('pausing does not fabricate new fixes from journey ticks', resting.timestamp === paused.timestamp && resting.sampleAt === paused.timestamp && JSON.stringify(resting.location) === JSON.stringify(paused.location), { paused, resting });
            await page.getByRole('button', { name: 'Play simulation', exact: true }).click();
            await page.waitForTimeout(2300);
            check('resume advances the same trip without a render loop', await page.evaluate(before => __trip.getState().journeySnapshot.tripId === before.tripId && __trip.getState().simulatedTimestamp > before.timestamp && !document.body.innerText.includes('Something went wrong'), paused));
            await page.getByRole('button', { name: 'Skip to next station', exact: true }).click();
            await page.waitForTimeout(4200);
            const dwelling = await page.evaluate(() => ({ status: __trip.getState().journeySnapshot.statusCode, current: __trip.getState().currentStation?.id, effective: __loc.getState().sample, body: document.body.innerText }));
            check('station skip settles dwelling through timestamped samples', dwelling.current === 'L2-02' && dwelling.status === 'AT_STATION' && dwelling.effective?.speedKph === 0 && dwelling.body.includes('CURRENT STATION'), dwelling);
            await page.getByRole('button', { name: 'Transfer QA', exact: true }).click();
            await page.waitForTimeout(4200);
            const switched = await page.evaluate(() => ({ origin: __trip.getState().origin?.id,
                destination: __trip.getState().destination?.id, tripId: __trip.getState().journeySnapshot.tripId,
                transfers: __trip.getState().journeySnapshot.route?.totalTransferCount }));
            check('switching scenarios explicitly begins a new simulation trip', switched.origin === 'L1-20' && switched.destination === 'M3-13' && switched.tripId !== paused.tripId && switched.transfers > 0, switched);
            page.once('dialog', dialog => dialog.accept());
            await page.getByRole('button', { name: 'Reset', exact: true }).click();
            await page.waitForTimeout(2300);
            check('simulator reset stays idle and clears its input clock', await page.evaluate(() => __trip.getState().status === 'IDLE' && !__trip.getState().isGpsOverride && __trip.getState().simulatedTimestamp === null));
            await page.getByRole('button', { name: 'Show simulation controls', exact: true }).click();
            const liveTrip = await page.evaluate(({ from, to }) => {
                const s = __trip.getState();
                s.setOrigin(from); s.setDestination(to); s.setTicketType('SJT'); s.beginTrip();
                return __trip.getState().journeySnapshot.tripId;
            }, { from: station('L1-20'), to: station('L1-19') });
            await page.getByRole('button', { name: 'Play simulation', exact: true }).click();
            await page.waitForTimeout(300);
            check('Play cannot convert a live journey into simulator ownership', await page.evaluate(id => __trip.getState().journeySnapshot.tripId === id && !__trip.getState().isGpsOverride, liveTrip));
            await page.getByRole('button', { name: 'Transfer QA', exact: true }).click();
            await page.waitForTimeout(500);
            check('scenario replacement cannot erase an active non-simulated journey', await page.evaluate(id => __trip.getState().journeySnapshot.tripId === id && __trip.getState().destination?.id === 'L1-19' && !__trip.getState().isGpsOverride, liveTrip));
            await page.evaluate(() => __trip.getState().reset());
            await page.getByRole('button', { name: 'Transfer QA', exact: true }).click();
            await page.waitForTimeout(4200);
            check('mounted transfer scenario starts without a render loop', await page.evaluate(() => __trip.getState().origin?.id === 'L1-20' && __trip.getState().destination?.id === 'M3-13' && __trip.getState().journeySnapshot.route.totalTransferCount > 0 && __loc.getState().sample?.source === 'simulation' && !document.body.innerText.includes('Something went wrong')));
            await page.screenshot({ path: path.join(OUTPUT, 'simulator-transfer-390.png') });
            output.screenshots.push('simulator-transfer-390.png');
            await page.getByRole('button', { name: 'Pause simulation', exact: true }).click();
            const completedSimulation = await page.evaluate(() => {
                __trip.getState().endTrip();
                return __trip.getState().journeySnapshot.tripId;
            });
            await page.getByRole('button', { name: 'Play simulation', exact: true }).click();
            await page.waitForTimeout(3500);
            check('completed simulator replay creates a new trip and cancels the old receipt timer', await page.evaluate(id => __trip.getState().journeySnapshot.tripId !== id && ['WAITING', 'TRANSIT'].includes(__trip.getState().status) && __trip.getState().isGpsOverride, completedSimulation));
            await page.evaluate(() => __trip.getState().reset());
            await page.waitForTimeout(2300);
            check('direct store reset cannot re-enable simulator override', await page.evaluate(() => __trip.getState().status === 'IDLE' && !__trip.getState().isGpsOverride && __trip.getState().simulatedTimestamp === null));
            await page.evaluate(initial => { __stopCountingSimulation(); __trip.setState({ isDevMode: false }); window.__keepGpsFresh = setInterval(() => __gps(initial), 1000); }, station('L1-02'));
        });
        if (ONLY_PHASE !== 'simulator playback') {
        await phase('waiting PWA worker respects hydration and recovery gate', async () => {
            await page.evaluate(() => { __trip.setState({ persistenceHydrated: false, status: 'IDLE', origin: null, pendingTripRecovery: null, pendingCompletedTrip: null }); });
            await page.waitForTimeout(200);
            await page.evaluate(() => __stageWaitingWorker());
            await page.waitForTimeout(400);
            check('waiting worker sends no SKIP_WAITING before persistence hydration', await page.evaluate(() => !__pwaMessages.some(message => message.type === 'SKIP_WAITING')));
            const recovery = { version: 2, ownerId: null, savedAt: Date.now(), tripStartedAt: now, originId: origin.id, destinationId: target.id, transitMode: 'train', selectedLine: origin.lineId, ticketType: 'SJT', line7Mode: 'LIVE', isDevMode: false, runningFare: 0, journeySnapshot: createJourneySnapshot(buildJourneyRoute(origin, target)) };
            await page.evaluate(recovery => __trip.setState({ persistenceHydrated: true, pendingTripRecovery: recovery }), recovery);
            await page.waitForTimeout(400);
            check('waiting worker preserves pending recovery after hydration', await page.evaluate(() => !__pwaMessages.some(message => message.type === 'SKIP_WAITING') && Boolean(__trip.getState().pendingTripRecovery)));
            await page.evaluate(() => __trip.setState({ pendingTripRecovery: null }));
            await page.waitForFunction(() => __pwaMessages.some(message => message.type === 'SKIP_WAITING'));
            check('waiting worker activates only after hydrated idle recovery-free state', await page.evaluate(() => __pwaMessages.filter(message => message.type === 'SKIP_WAITING').length === 1));
            await page.evaluate(() => { __pwaRegistration.waiting = null; });
        });
        const cdp = await context.newCDPSession(page);
        await cdp.send('Network.enable');
        let networkBytes = 0, networkRequests = 0;
        cdp.on('Network.loadingFinished', event => { networkBytes += event.encodedDataLength; networkRequests++; });
        async function readState(label) {
            const state = await page.evaluate(() => { const s = __trip.getState(); return { status: s.status, snapshot: s.journeySnapshot, fallbackLocation: s.fallbackLocation, effective: __loc.getState().sample, body: document.body.innerText, forecasts: __fleet.getState().stationForecasts, snapshots: __fleet.getState().predictionSnapshots.map(x => ({ key: x.key, sourceVersion: x.response.sourceVersion, receivedAt: x.receivedAt })), bars: [...document.querySelectorAll('[role="progressbar"]')].map(e => ({ label: e.getAttribute('aria-label'), value: Number(e.getAttribute('aria-valuenow')), width: e.firstElementChild?.style.width })) }; });
            output.states.push({ label, ...state }); return state;
        }
        async function begin(from, to) {
            await page.evaluate(from => { window.__gpsQuiet = false; __advanceTime(240000); __gps(from); window.__gpsQuiet = true; }, from);
            await page.waitForTimeout(150);
            await page.evaluate(({ from, to }) => { clearInterval(window.__keepGpsFresh); clearInterval(window.__safetyGpsTimer); __trip.getState().discardCompletedTrip(); __trip.getState().reset(); __trip.setState({ isDevMode: false, isGpsOverride: false }); __trip.getState().setOrigin(from); __trip.getState().setDestination(to); __trip.getState().setTicketType('SJT'); __trip.getState().beginTrip(); }, { from, to });
            await page.waitForTimeout(250);
            return (await readState('begin-' + from.id + '-' + to.id)).snapshot;
        }
        async function sync(value) { await page.evaluate(s => __trip.getState().syncJourneySnapshot(s), value); await page.waitForTimeout(200); }
        async function getMap() {
            return page.evaluate(() => {
                const element = document.querySelector('.leaflet-container');
                const key = Object.keys(element).find(key => key.startsWith('__reactFiber'));
                let start = element[key]; while (start?.return) start = start.return;
                const stack = [start], seen = new Set();
                while (stack.length) {
                    const fiber = stack.pop(); if (!fiber || seen.has(fiber)) continue; seen.add(fiber);
                    const candidate = fiber.memoizedProps?.value?.map;
                    if (candidate?._container === element) { window.__map = candidate; return true; }
                    stack.push(fiber.child, fiber.sibling);
                }
                return false;
            });
        }
        async function retainedPredictions(label) {
            await page.waitForFunction(() => __fleet.getState().predictionState === 'fresh', null, { timeout: 15000 });
            const before = await page.evaluate(() => ({ revision: __fleet.getState().predictionRevision, snapshots: __fleet.getState().predictionSnapshots, ids: __fleet.getState().rawTrains.filter(t => t.source === 'predicted').map(t => t.id) }));
            await page.waitForTimeout(2300);
            const after = await page.evaluate(() => ({ snapshots: __fleet.getState().predictionSnapshots, ids: __fleet.getState().rawTrains.filter(t => t.source === 'predicted').map(t => t.id) }));
            check('HTTP predictions retained through one-second ' + label + ' ticks', before.ids.length > 0 && before.ids.every(id => after.ids.includes(id)) && after.snapshots.every(s => s.response.sourceVersion === 'repair-http-response'), { beforeIds: before.ids, afterIds: after.ids, sourceVersions: after.snapshots.map(s => s.response.sourceVersion) });
        }
        await page.evaluate(() => __trip.getState().reset());
        const tap = page.getByRole('button', { name: 'TAP IN', exact: true });
        if (await tap.count()) await tap.click(); else await page.getByRole('button', { name: /EDSA.*TAP IN/s }).click();
        const dialog = page.getByRole('dialog', { name: 'Select Fare Type' });
        await dialog.waitFor();
        check('fare dialog focus', await dialog.evaluate(e => e.contains(document.activeElement)));
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);
        check('fare dialog Escape stays closed', await page.getByRole('dialog').count() === 0);
        await page.evaluate(() => { __trip.getState().reset(); });
        await page.waitForTimeout(100);
        if (await tap.count()) await tap.click(); else await page.getByRole('button', { name: /EDSA.*TAP IN/s }).click();
        await page.getByRole('button', { name: /Single Journey/ }).click();
        await page.getByRole('button', { name: /Magallanes/ }).click();
        await page.waitForTimeout(500);
        check('NAV transfer displays compass fallback', (await page.locator('body').innerText()).includes('Compass permission needed'));
        check('no effect-triggered compass prompt', await page.evaluate(() => __compassRequests === 0));
        const bars = await page.getByRole('progressbar').evaluateAll(elements => elements.map(e => ({ now: e.getAttribute('aria-valuenow'), min: e.getAttribute('aria-valuemin'), max: e.getAttribute('aria-valuemax') })));
        check('both progress bars semantic', bars.length === 2 && bars.every(b => b.min === '0' && b.max === '100'), bars);
        await page.evaluate(() => __trip.getState().setMaintenanceMode(true));
        await page.waitForTimeout(100);
        check('maintenance retains active navigation', (await page.locator('body').innerText()).includes('NAV MODE'));
        await page.evaluate(() => __trip.getState().setMaintenanceMode(false));
        await page.evaluate(() => __trip.getState().toggleShowRushHour());
        const congestionDismiss = page.getByRole('button', { name: 'Dismiss congestion alert' });
        if (await congestionDismiss.count()) { await congestionDismiss.click(); await page.waitForTimeout(600); }
        async function topOfSheet() { await page.evaluate(() => { const sheet = document.querySelector('main > .absolute.inset-0.z-10'); if (sheet) { sheet.scrollTop = 0; sheet.dispatchEvent(new Event('scroll')); } }); await page.waitForTimeout(450); }
        await topOfSheet();
        await page.getByRole('button', { name: 'Settings Menu' }).click();
        await page.getByRole('button', { name: 'Switch to dark mode' }).click();
        await page.getByRole('button', { name: 'Settings Menu' }).click();
        async function screenshot(name) { await topOfSheet(); await page.waitForTimeout(800); const file = path.join(OUTPUT, name); await page.screenshot({ path: file }); output.screenshots.push(file); }
        async function credits() {
            return page.locator('.tt-map-attribution').evaluate(e => {
                const s = getComputedStyle(e), r = e.getBoundingClientRect();
                const hit = document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2);
                return { background: s.backgroundColor, color: s.color, textShadow: s.textShadow, padding: s.padding, font: s.fontFamily, links: e.querySelectorAll('a').length, contributors: e.textContent.includes('OpenStreetMap contributors'), width: r.width, unobscured: hit[0] === e || e.contains(hit[0]), inBounds: r.left >= 0 && r.right <= innerWidth && r.bottom < innerHeight / 2 };
            });
        }
        for (const theme of ['dark', 'light']) {
            if (theme === 'light') { await topOfSheet(); await page.getByRole('button', { name: 'Settings Menu' }).click(); await page.getByRole('button', { name: 'Switch to light mode' }).click(); await page.getByRole('button', { name: 'Settings Menu' }).click(); }
            for (const size of [{ width: 390, height: 844 }, { width: 360, height: 640 }, { width: 412, height: 915 }, { width: 844, height: 390 }]) {
                await page.setViewportSize(size); await page.waitForTimeout(400);
                const credit = await credits(); check(`transparent unobscured credits ${theme} ${size.width}`, credit.background === 'rgba(0, 0, 0, 0)' && credit.padding === '0px' && credit.links === 2 && credit.inBounds && credit.unobscured, credit);
                const dims = await page.evaluate(() => ({ viewport: innerWidth, width: document.documentElement.scrollWidth, map: document.querySelector('.leaflet-container')?.getBoundingClientRect().toJSON() }));
                check(`viewport no horizontal overflow ${theme} ${size.width}`, dims.width <= dims.viewport && dims.map.width === dims.viewport, dims);
                check(`visible contributors credit fits ${theme} ${size.width}`, credit.contributors && credit.inBounds && credit.links === 2 && credit.unobscured, credit);
                await screenshot(`ui-repair-${theme}-${size.width}.png`);
            }
        }
        await page.setViewportSize({ width: 390, height: 844 });
        await page.evaluate(() => {
            __fleet.getState().upsertTrain({ id: 'ui-marker', lineId: 'MRT3', direction: 'NORTHBOUND', lat: 14.543, lng: 121.008, stationId: 'M3-13', stationName: 'Taft Avenue', source: 'crowd', statusCode: 'IN_TRANSIT', speedKph: 20, confidence: .9, updatedAt: Date.now() });
        });
        const marker = page.locator('.train-marker-icon').first();
        await marker.waitFor();
        const markerBefore = await marker.evaluate(e => ({ transform: e.style.transform, width: e.getBoundingClientRect().width }));
        await marker.hover({ force: true }); await page.waitForTimeout(400);
        const markerAfter = await marker.evaluate(e => ({ transform: e.style.transform, width: e.getBoundingClientRect().width }));
        check('marker hover preserves Leaflet anchor transform', JSON.stringify(markerBefore) === JSON.stringify(markerAfter), { markerBefore, markerAfter });
        await page.evaluate(args => { __trip.getState().reset(); __trip.getState().setOrigin(args.origin); __trip.getState().setDestination(args.destination); __trip.getState().setTicketType('SJT'); __trip.getState().beginTrip(); }, { origin, destination: target });
        await page.waitForTimeout(500);
        await page.getByRole('button', { name: 'Edit fare type' }).click();
        const before = await page.evaluate(() => { const s = __trip.getState(); return { tripId: s.journeySnapshot.tripId, startedAt: s.journeySnapshot.startedAt, current: s.currentStation.id }; });
        await page.getByRole('button', { name: /Stored Value/ }).click();
        await page.getByRole('button', { name: 'Regular', exact: false }).click();
        const after = await page.evaluate(() => { const s = __trip.getState(); return { tripId: s.journeySnapshot.tripId, startedAt: s.journeySnapshot.startedAt, current: s.currentStation.id }; });
        check('active fare amendment preserves identity/time/station', JSON.stringify(before) === JSON.stringify(after), { before, after });
        await phase('existing destination-edit action enters existing picker', async () => {
            const before = await page.evaluate(() => { const s = __trip.getState(); return { tripId: s.journeySnapshot.tripId, startedAt: s.journeySnapshot.startedAt, current: s.currentStation.id, origin: s.origin.id }; });
            const invoked = await page.evaluate(() => {
                const element = document.querySelector('main'), key = Object.keys(element).find(k => k.startsWith('__reactFiber'));
                const stack = [element[key]], seen = new Set();
                while (stack.length) { const fiber = stack.pop(); if (!fiber || seen.has(fiber)) continue; seen.add(fiber);
                    if (typeof fiber.memoizedProps?.onUpdateOrigin === 'function' && typeof fiber.memoizedProps?.onChangeDestination === 'function') { fiber.memoizedProps.onChangeDestination(); return true; }
                    stack.push(fiber.child, fiber.sibling);
                }
                return false;
            });
            check('existing destination action reachable in mounted component props', invoked);
            await page.getByRole('dialog', { name: 'Select Destination', exact: true }).waitFor();
            await page.getByRole('button', { name: /Monumento/ }).click();
            const after = await page.evaluate(() => { const s = __trip.getState(); return { tripId: s.journeySnapshot.tripId, startedAt: s.journeySnapshot.startedAt, current: s.currentStation.id, origin: s.origin.id, destination: s.destination.id }; });
            check('destination amendment preserves identity/start/boarding/cursor', after.destination === 'L1-18' && after.tripId === before.tripId && after.startedAt === before.startedAt && after.current === before.current && after.origin === before.origin, { before, after });
            output.pending.push('Destination action invoked through existing component props for integration coverage; real wrong-way alert detection, GPS validation and its visible action need the owner replay.');
        });
        const stationTarget = page.getByRole('button', { name: 'Station information: EDSA', exact: true });
        await stationTarget.focus(); await page.keyboard.press('Enter');
        await page.getByRole('button', { name: 'Close station information' }).waitFor();
        await page.keyboard.press('Escape'); await page.waitForTimeout(200);
        check('station keyboard target opens and Escape closes', await page.getByRole('button', { name: 'Close station information' }).count() === 0);
        const lineTab = page.getByRole('button', { name: 'LRT-2', exact: true });
        await lineTab.evaluate(element => element.click());
        check('line browsing selection survives initial render', await lineTab.getAttribute('aria-pressed') === 'true');
        await page.waitForTimeout(11000);
        check('line follow timer returns to current line', await page.getByRole('button', { name: 'LRT-1', exact: true }).getAttribute('aria-pressed') === 'true');
        await phase('station/train icon identity and uninterrupted interpolation', async () => {
            let trip = await begin(origin, station('M3-10'));
            const edge = trip.route.edges[0], path = getJourneyRailEdgePath(edge, station(edge.fromStationId), station(edge.toStationId)), length = getPolylineLengthMeters(path);
            const at = fraction => interpolatePolyline(path, length * fraction);
            const timestamp = await page.evaluate(() => { __advanceTime(4000); return Date.now(); });
            trip = reduceJourneySnapshot(trip, { type: 'LOCATION_SAMPLE', location: at(.25), speedKph: 36, gpsAccuracy: 5, timestamp, source: 'gps' });
            await sync(trip);
            const probe = { id: 'marker-identity-probe', lineId: 'LRT1', direction: 'SOUTHBOUND', lat: at(.25).latitude, lng: at(.25).longitude, stationId: origin.id, stationName: origin.name, source: 'crowd', statusCode: 'IN_TRANSIT', speedKph: 36, confidence: .9, freshness: 'fresh' };
            await page.evaluate(probe => __fleet.getState().upsertTrain({ ...probe, updatedAt: Date.now() }), probe);
            await page.waitForTimeout(1200);
            assert.ok(await getMap());
            const captured = await page.evaluate(point => {
                const layers = Object.values(__map._layers);
                window.__stationIcons = layers.filter(layer => layer.options?.icon?.options?.className?.includes('custom-station')).map(layer => ({ layer, icon: layer.options.icon, html: layer.options.icon.options.html, outer: layer._icon, inner: layer._icon?.firstElementChild }));
                window.__movingProbe = layers.find(layer => layer.options?.icon?.options?.className === 'train-marker-icon' && layer.options.zIndexOffset === 100 && Math.abs(layer.getLatLng().lat - point.latitude) < .00001 && Math.abs(layer.getLatLng().lng - point.longitude) < .00001);
                const train = window.__movingProbe;
                window.__trainIcon = train && { icon: train.options.icon, outer: train._icon, inner: train._icon.firstElementChild, pulse: train._icon.querySelector('animate') };
                window.__cardStyles = [...document.querySelectorAll('[role="progressbar"]')].map(bar => { const card = bar.closest('.rounded-3xl'), css = getComputedStyle(card); return { classes: card.className, radius: css.borderRadius, font: css.fontFamily, color: css.color, background: css.backgroundColor }; });
                return { stations: __stationIcons.length, stationClasses: __stationIcons.reduce((counts, item) => { const name = item.icon.options.className; counts[name] = (counts[name] ?? 0) + 1; return counts; }, {}), moving: Boolean(train), pulse: Boolean(__trainIcon?.pulse), anchor: train?.options.icon.options.iconAnchor, size: train?.options.icon.options.iconSize };
            }, at(.25));
            const expectedStations = STATIONS.filter(station => ['LRT1', 'LRT2', 'MRT3'].includes(station.lineId)).length;
            check('map identity probe captures mounted station and moving pulse nodes', captured.stations === expectedStations && captured.moving && captured.pulse && JSON.stringify(captured.anchor) === '[20,20]' && JSON.stringify(captured.size) === '[40,40]', { ...captured, expectedStations });
            const barsBefore = (await readState('icon-probe-before')).bars;
            await page.evaluate(() => { const state = __fleet.getState(); state.setPredictedTrains(state.rawTrains.filter(train => train.source === 'predicted').map(train => ({ ...train, updatedAt: Date.now() }))); state.reconcileCrowdSnapshot(state.rawTrains.filter(train => train.source === 'crowd').map(train => ({ ...train, updatedAt: Date.now() })), Date.now()); });
            await page.waitForTimeout(350);
            const afterPoll = await page.evaluate(() => ({ total: __stationIcons.length, sameHtml: __stationIcons.filter(item => item.html === item.layer.options.icon.options.html).length, sameIcon: __stationIcons.filter(item => item.icon === item.layer.options.icon).length, sameDom: __stationIcons.filter(item => item.outer === item.layer._icon && item.inner === item.layer._icon?.firstElementChild).length, trainSame: __trainIcon.icon === __movingProbe.options.icon && __trainIcon.inner === __movingProbe._icon.firstElementChild && __trainIcon.pulse === __movingProbe._icon.querySelector('animate') }));
            check('unchanged polling preserves station icon objects and actual inner DOM', afterPoll.sameHtml === afterPoll.total && afterPoll.sameIcon === afterPoll.total && afterPoll.sameDom === afterPoll.total, afterPoll);
            check('unchanged target polling preserves native moving train SVG identity', afterPoll.trainSame, afterPoll);
            const target = at(.4);
            await page.evaluate(({ probe, target }) => __fleet.getState().upsertTrain({ ...probe, lat: target.latitude, lng: target.longitude, updatedAt: Date.now(), sampleId: 'marker-moving-target' }), { probe, target });
            await page.waitForTimeout(180);
            const early = await page.evaluate(() => { const point = __movingProbe.getLatLng(); const state = __fleet.getState(); state.reconcileCrowdSnapshot(state.rawTrains.filter(train => train.source === 'crowd').map(train => ({ ...train })), Date.now()); return { lat: point.lat, lng: point.lng }; });
            await page.waitForTimeout(320);
            const late = await page.evaluate(() => { const point = __movingProbe.getLatLng(); return { lat: point.lat, lng: point.lng }; });
            await page.waitForTimeout(500);
            const finished = await page.evaluate(() => { const point = __movingProbe.getLatLng(); return { lat: point.lat, lng: point.lng }; });
            const delta = point => Math.hypot(point.lat - target.latitude, point.lng - target.longitude);
            check('getLatLng advances after unchanged store clone during 800ms interpolation', delta(late) < delta(early) && delta(finished) < .000001, { early, late, finished, target });
            const nextTimestamp = await page.evaluate(() => { __advanceTime(4000); return Date.now(); });
            trip = reduceJourneySnapshot(trip, { type: 'LOCATION_SAMPLE', location: at(.6), speedKph: 36, gpsAccuracy: 5, timestamp: nextTimestamp, source: 'gps' });
            await sync(trip);
            const progressed = await readState('icon-probe-progress');
            const afterProgress = await page.evaluate(() => ({ sameHtml: __stationIcons.every(item => item.html === item.layer.options.icon.options.html), sameDom: __stationIcons.every(item => item.icon === item.layer.options.icon && item.inner === item.layer._icon?.firstElementChild), sameStyles: JSON.stringify(__cardStyles) === JSON.stringify([...document.querySelectorAll('[role="progressbar"]')].map(bar => { const card = bar.closest('.rounded-3xl'), css = getComputedStyle(card); return { classes: card.className, radius: css.borderRadius, font: css.fontFamily, color: css.color, background: css.backgroundColor }; })) }));
            check('journey progress retains unchanged station icon DOM and current card styles', afterProgress.sameHtml && afterProgress.sameDom && afterProgress.sameStyles, afterProgress);
            check('icon caching leaves both NAV progress bars advancing', progressed.bars.length === 2 && progressed.bars.every((bar, index) => bar.value > barsBefore[index].value && Math.abs(parseFloat(bar.width) - bar.value) <= .5), { before: barsBefore, after: progressed.bars });
        });
        await phase('all four rendered train states and both progress bars', async () => {
            let trip = await begin(station('M3-13'), station('M3-11'));
            const edge = trip.route.edges[0], geo = getJourneyRailEdgePath(edge, station(edge.fromStationId), station(edge.toStationId));
            for (const [fraction, speed, code, label] of [[0, 0, 'AT_STATION', 'CURRENT STATION'], [.1, 36, 'LEAVING_STATION', 'NOW LEAVING'], [.4, 36, 'BETWEEN_STATIONS', 'IN TRANSIT'], [.85, 24, 'APPROACHING_STATION', 'NOW APPROACHING']]) {
                const timestamp = await page.evaluate(() => { __advanceTime(4000); return Date.now(); });
                trip = reduceJourneySnapshot(trip, { type: 'LOCATION_SAMPLE', location: interpolatePolyline(geo, getPolylineLengthMeters(geo) * fraction), speedKph: speed, gpsAccuracy: 5, timestamp, source: 'gps' });
                await sync(trip); const rendered = await readState('four-state-' + code);
                check(`rendered ${label} matches engine ${code}`, trip.statusCode === code && rendered.snapshot.statusCode === code && rendered.body.includes(label), { expected: code, actual: rendered.snapshot.statusCode });
                check(`both displayed and ARIA progress values agree ${code}`, rendered.bars.length === 2 && rendered.bars[0].value === Math.round(trip.legProgress) && rendered.bars[1].value === Math.round(trip.totalProgress) && rendered.bars.every(bar => Math.abs(parseFloat(bar.width) - bar.value) <= .5), rendered.bars);
                await screenshot(`state-${code.toLowerCase()}-390.png`);
            }
            await retainedPredictions('four-state-transit');
        });
        await phase('raw GPS four-state and speedometer pipeline', async () => {
            const from = station('M3-13'), to = station('M3-11');
            const trip = await begin(from, to), edge = trip.route.edges[0];
            const geometry = getJourneyRailEdgePath(edge, station(edge.fromStationId), station(edge.toStationId)), length = getPolylineLengthMeters(geometry);
            let previousFraction = 0;
            for (const [fraction, speed, code, label] of [[0, 0, 'AT_STATION', 'CURRENT STATION'], [.1, 36, 'LEAVING_STATION', 'NOW LEAVING'], [.4, 36, 'BETWEEN_STATIONS', 'IN TRANSIT'], [.85, 24, 'APPROACHING_STATION', 'NOW APPROACHING']]) {
                const point = interpolatePolyline(geometry, length * fraction);
                const elapsed = Math.max(6000, Math.ceil((fraction - previousFraction) * length / Math.max(1, speed / 3.6) * 1000));
                previousFraction = fraction;
                await page.evaluate(({ point, speed, elapsed }) => { __advanceTime(elapsed); __gpsQuiet = false; __gps(point, speed); __gpsQuiet = true; }, { point, speed, elapsed });
                await page.waitForFunction(code => __trip.getState().journeySnapshot.statusCode === code, code, { timeout: 10000 });
                await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
                const state = await readState('raw-GPS-' + code);
                const counter = await page.locator('svg.lucide-gauge').first().evaluate(icon => Number(icon.parentElement.querySelector('span').textContent));
                const estimated = state.snapshot.gpsFallbackActive || state.snapshot.estimatorMode === 'RECOVERING';
                const expectedSource = estimated ? 'fallback' : 'gps';
                const expectedTimestamp = estimated ? state.snapshot.lastEstimatorUpdateAt : state.snapshot.lastSampleAt;
                check(`raw GPS drives ${label}, effective sample and speedometer together`, state.body.includes(label) && state.effective.source === expectedSource && state.effective.timestamp === expectedTimestamp && state.effective.lastTrustedFixAt === state.snapshot.lastTrustedFixAt && counter === Math.round(state.effective.speedKph) && (speed === 0 ? counter === 0 : counter > 0), { code: state.snapshot.statusCode, estimatorMode: state.snapshot.estimatorMode, expectedSource, effective: state.effective, counter, estimatedSpeed: state.snapshot.estimatedSpeedKph, bars: state.bars });
                await screenshot('raw-gps-' + code.toLowerCase() + '-390.png');
            }
            const stop = station(edge.toStationId);
            for (let index = 0; index < 2; index++) {
                const elapsed = index === 0 ? Math.max(4000, Math.ceil((1 - previousFraction) * length / (24 / 3.6) * 1000)) : 4000;
                await page.evaluate(({ point, elapsed }) => { __advanceTime(elapsed); __gpsQuiet = false; __gps(point, 0); __gpsQuiet = true; }, { point: stop, elapsed });
                await page.waitForTimeout(400);
                if (index === 0) {
                    const effective = await page.evaluate(() => __loc.getState().sample.speedKph);
                    const counter = await page.locator('svg.lucide-gauge').first().evaluate(icon => Number(icon.parentElement.querySelector('span').textContent));
                    check('native zero speed reaches the speedometer on the first stopping sample', effective === 0 && counter === 0, { effectiveSpeed: effective, counter });
                }
            }
            const stopped = await readState('raw-GPS-confirmed-stop');
            const counter = await page.locator('svg.lucide-gauge').first().evaluate(icon => Number(icon.parentElement.querySelector('span').textContent));
            check('raw GPS station stop settles CURRENT STATION and zero speed', stopped.snapshot.statusCode === 'AT_STATION' && stopped.snapshot.currentStationId === stop.id && stopped.snapshot.activeEdgeIndex === 1 && stopped.body.includes('CURRENT STATION') && counter === 0 && stopped.effective.speedKph === 0, { status: stopped.snapshot.statusCode, currentStationId: stopped.snapshot.currentStationId, activeEdgeIndex: stopped.snapshot.activeEdgeIndex, counter, effectiveSpeed: stopped.effective.speedKph });
            check('raw GPS confirmed stop resets adjacent bar without erasing whole-trip progress', stopped.bars.length === 2 && stopped.bars[0].value === 0 && stopped.bars[1].value > 0 && stopped.bars[1].value < 100, stopped.bars);
            await screenshot('raw-gps-confirmed-stop-390.png');
            await page.evaluate(() => __trip.getState().reset());
        });
        await phase('multi-stop NAV/progress/route quote integration', async () => {
            await page.evaluate(() => { window.__gpsQuiet = true; });
            let journey = await begin(station('L1-20'), station('M3-12'));
            const first = journey.route.edges[0];
            const geometry = getJourneyRailEdgePath(first, station(first.fromStationId), station(first.toStationId));
            const sample = async (location, speed = 0) => { const timestamp = await page.evaluate(() => { __advanceTime(4000); return Date.now(); }); journey = reduceJourneySnapshot(journey, { type: 'LOCATION_SAMPLE', location, speedKph: speed, gpsAccuracy: 5, timestamp, source: 'gps' }); };
            await sample(interpolatePolyline(geometry, getPolylineLengthMeters(geometry) * .5), 36);
            await sync(journey);
            let rendered = await readState('NAV-rail-half-first-adjacent');
            let view = buildJourneyTripLogicView(journey);
            check('NAV first bar uses railLegProgress, lower uses totalProgress', rendered.bars[0]?.value === Math.round(view.railLegProgress) && rendered.bars[1]?.value === Math.round(view.totalProgress) && Math.abs(view.railLegProgress - view.legProgress) > 5, { bars: rendered.bars, view });
            await retainedPredictions('transit');
            await sample(station(first.toStationId)); await sample(station(first.toStationId));
            await sync(journey); rendered = await readState('NAV-intermediate-dwell'); view = buildJourneyTripLogicView(journey);
            check('NAV first bar does not reset at intermediate dwell', journey.activeEdgeIndex === 1 && view.legProgress === 0 && rendered.bars[0]?.value === Math.round(view.railLegProgress) && view.railLegProgress > 0, { bars: rendered.bars, current: journey.currentStationId, view });
            const firstDwellProgress = view.railLegProgress;
            const second = journey.route.edges[1], secondGeometry = getJourneyRailEdgePath(second, station(second.fromStationId), station(second.toStationId));
            await sample(interpolatePolyline(secondGeometry, getPolylineLengthMeters(secondGeometry) * .5), 36); await sync(journey);
            const secondMoving = await readState('NAV-second-adjacent-moving');
            await sample(station(second.toStationId)); await sample(station(second.toStationId)); await sync(journey);
            const secondDwell = await readState('NAV-second-intermediate-dwell');
            const secondView = buildJourneyTripLogicView(journey);
            check('NAV rail-leg fill monotonic through multiple intermediate stops', secondMoving.bars[0]?.value >= Math.round(firstDwellProgress) && secondDwell.bars[0]?.value >= secondMoving.bars[0]?.value && secondDwell.bars[0]?.value === Math.round(secondView.railLegProgress) && secondView.legProgress === 0, { firstDwellProgress, secondMoving: secondMoving.bars, secondDwell: secondDwell.bars });
            await retainedPredictions('dwell');
            await screenshot('nav-rail-dwell-390.png');
            await page.evaluate(s => __trip.getState().amendTrip({ destination: s }), station('L1-25'));
            await page.waitForTimeout(250);
            const amended = await page.evaluate(() => ({ stations: __trip.getState().computedRoute, startedAt: __trip.getState().journeySnapshot.startedAt, tripId: __trip.getState().journeySnapshot.tripId }));
            check('route amendment retains visited prefix and identity', amended.tripId === journey.tripId && amended.stations[0].id === 'L1-20' && amended.stations.some(s => s.id === first.toStationId), amended);
            const nav = await begin(station('L1-20'), station('M3-12'));
            await page.evaluate(({ snapshot, stations }) => { __trip.setState({ computedRoute: stations, journeySnapshot: { ...__trip.getState().journeySnapshot, startedAt: snapshot.startedAt } }); }, { snapshot: nav, stations: [station('L1-20'), station('L1-19'), station('L1-20'), ...nav.route.stationIds.slice(1).map(station)] });
            await page.waitForTimeout(250);
            const quoteState = await page.evaluate(() => ({ route: __trip.getState().computedRoute, start: __trip.getState().journeySnapshot.startedAt }));
            const quoted = getFareBreakdown(station('L1-20'), station('M3-12'), 'SJT', quoteState.route, quoteState.start);
            check('fare quote repeated route/time reaches mounted breakdown', (await page.locator('body').innerText()).includes(`Quoted Total`) && (await page.locator('body').innerText()).includes(`₱${quoted.total}`), { quoted, route: quoteState.route.map(s => s.id), start: quoteState.start });
            const ordinary = await begin(origin, target);
            const edge = ordinary.route.edges[0], rail = getJourneyRailEdgePath(edge, origin, target);
            const moving = reduceJourneySnapshot(ordinary, { type: 'LOCATION_SAMPLE', location: interpolatePolyline(rail, getPolylineLengthMeters(rail) * .4), speedKph: 36, gpsAccuracy: 5, timestamp: await page.evaluate(() => Date.now()) + 4000, source: 'gps' });
            await sync(moving); const normal = await readState('non-NAV-adjacent');
            check('ordinary non-NAV bar keeps adjacent legProgress', normal.bars[0]?.value === Math.round(moving.legProgress), normal.bars);
        });
        await phase('raw GPS transfer and final receipt runtime', async () => {
            await page.evaluate(args => { window.__gpsQuiet = false; __advanceTime(180000); __gps(args); }, station('L1-02'));
            const initialWalk = await begin(station('L1-02'), station('M3-12'));
            await page.evaluate(() => { window.__gpsQuiet = false; });
            const walk = initialWalk.route.edges[0], from = station(walk.fromStationId), to = walk.targetCoordinates ?? station(walk.toStationId);
            const samples = [];
            for (const fraction of [.15, .4, .7, .85, 1, 1]) {
                const location = { latitude: from.latitude + (to.latitude - from.latitude) * fraction, longitude: from.longitude + (to.longitude - from.longitude) * fraction };
                await page.evaluate(({ location, speed, wait }) => { __advanceTime(wait); __gps(location, speed); }, { location, speed: fraction < 1 ? 3.6 : 0, wait: fraction === 1 ? 4000 : 12000 });
                await page.waitForTimeout(350); samples.push(await readState('raw-GPS-walk-' + fraction));
            }
            check('actual GPS runtime transfer walk progresses', samples[3].snapshot.legProgress > samples[0].snapshot.legProgress + 30, samples.map(s => ({ phase: s.snapshot.phase, legProgress: s.snapshot.legProgress })));
            check('actual target GPS confirms receiving rail edge', samples.at(-1).snapshot.currentStationId === walk.toStationId && samples.at(-1).snapshot.activeEdgeIndex === 1, samples.at(-1).snapshot);
            check('transfer first bar switches walking to receiving-rail zero; whole trip continues', samples.slice(0, -1).every(s => s.bars[0]?.value === Math.round(s.snapshot.legProgress)) && samples.at(-1).bars[0]?.value === 0 && samples.at(-1).bars[1]?.value >= samples.at(-2).bars[1]?.value, samples.map(s => ({ phase: s.snapshot.phase, bars: s.bars })));
            await screenshot('raw-transfer-handoff-390.png');
            await page.evaluate(() => { window.__gpsQuiet = true; });
            await retainedPredictions('NAV/transfer');
            let arrival = createJourneySnapshot(initialWalk.route, { tripId: initialWalk.tripId, startedAt: initialWalk.startedAt });
            let time = await page.evaluate(() => Date.now());
            arrival = reduceJourneySnapshot(arrival, { type: 'LOCATION_SAMPLE', location: to, speedKph: 0, gpsAccuracy: 5, timestamp: time += 4000, source: 'gps' });
            arrival = reduceJourneySnapshot(arrival, { type: 'LOCATION_SAMPLE', location: to, speedKph: 0, gpsAccuracy: 5, timestamp: time += 4000, source: 'gps' });
            const edge = arrival.route.edges[arrival.activeEdgeIndex], rail = getJourneyRailEdgePath(edge, station(edge.fromStationId), station(edge.toStationId));
            for (const fraction of [.25, .5, .75, 1, 1]) arrival = reduceJourneySnapshot(arrival, { type: 'LOCATION_SAMPLE', location: interpolatePolyline(rail, getPolylineLengthMeters(rail) * fraction), speedKph: fraction < 1 ? 36 : 0, gpsAccuracy: 5, timestamp: time += 4000, source: 'gps' });
            await page.evaluate(() => __notifications.length = 0); await sync(arrival);
            await page.waitForFunction(() => __trip.getState().historySaveState === 'queued');
            const end = await readState('reducer-arrival');
            check('arrival records route distance and elapsed receipt', arrival.phase === 'ARRIVED' && end.body.includes('END TRIP') && end.body.includes(`${(arrival.completedDistanceMeters / 1000).toFixed(1)}km`), { completedDistanceMeters: arrival.completedDistanceMeters, startedAt: arrival.startedAt, completedAt: arrival.completedAt });
            check('final ARRIVED notification hook remains mounted', await page.evaluate(() => __notifications.some(n => n.title === 'You have arrived!')), await page.evaluate(() => __notifications));
            await screenshot('actual-receipt-390.png');
            await page.getByRole('button', { name: 'END TRIP', exact: true }).click(); await page.waitForTimeout(650);
            check('acknowledged receipt END TRIP resets', await page.evaluate(() => __trip.getState().status === 'IDLE'));
        });
        await phase('dead reckoning unified map/card/speed integration', async () => {
            await page.evaluate(() => { window.__gpsQuiet = true; });
            const fresh = await begin(station('M3-13'), station('M3-11'));
            const edge = fresh.route.edges[0], geo = getJourneyRailEdgePath(edge, station(edge.fromStationId), station(edge.toStationId));
            let aged = createJourneySnapshot(fresh.route, { tripId: fresh.tripId, startedAt: fresh.startedAt - 120000 });
            aged = reduceJourneySnapshot(aged, { type: 'LOCATION_SAMPLE', location: interpolatePolyline(geo, getPolylineLengthMeters(geo) * .3), speedKph: 40, gpsAccuracy: 5, timestamp: await page.evaluate(() => Date.now()) - 20000, source: 'gps' });
            aged = reduceJourneySnapshot(aged, { type: 'TICK', timestamp: await page.evaluate(() => Date.now()) });
            await sync(aged); await page.waitForTimeout(1800);
            const dr = await readState('DR-one-second-runtime');
            check('raw silence triggers DR effective sample and route cursor', dr.snapshot.gpsFallbackActive && dr.effective.source === 'fallback' && JSON.stringify(dr.effective.location) === JSON.stringify(dr.snapshot.estimatedLocation) && dr.effective.lastTrustedFixAt === dr.snapshot.lastTrustedFixAt, { effective: dr.effective, snapshot: dr.snapshot });
            check('DR card speed matches unified effective speed', dr.body.includes(String(Math.round(dr.effective.speedKph))) && Math.round(dr.effective.speedKph) === Math.round(dr.snapshot.estimatedSpeedKph), { effectiveSpeed: dr.effective.speedKph, estimate: dr.snapshot.estimatedSpeedKph });
            check('Leaflet map instance accessible for alignment probe', await getMap());
            if (await getMap()) {
                const camera = await page.evaluate(() => { const s = __loc.getState().sample; const p = __map.latLngToContainerPoint([s.location.latitude, s.location.longitude]); const size = __map.getSize(); return { x: p.x, y: p.y, width: size.x, height: size.y, zoom: __map.getZoom() }; });
                check('DR effective location remains framed by map camera', camera.x > 0 && camera.x < camera.width && camera.y > 0 && camera.y < camera.height, camera);
            }
            await screenshot('dr-unified-390.png');
            await page.evaluate(() => __trip.getState().reset());
        });
        await phase('native wheel holds camera against moving GPS then resumes follow', async () => {
            let trip = await begin(origin, station('M3-10'));
            const edge = trip.route.edges[0], geometry = getJourneyRailEdgePath(edge, station(edge.fromStationId), station(edge.toStationId));
            const length = getPolylineLengthMeters(geometry);
            const points = Array.from({ length: 80 }, (_, index) => interpolatePolyline(geometry, length * Math.min(.8, .35 + index * .005)));
            trip = reduceJourneySnapshot(trip, { type: 'LOCATION_SAMPLE', location: points[0], speedKph: 36, gpsAccuracy: 5, timestamp: await page.evaluate(() => Date.now()), source: 'gps' });
            await sync(trip); await topOfSheet(); await getMap();
            await page.waitForTimeout(1500);
            const before = await page.evaluate(() => ({ center: __map.getCenter(), zoom: __map.getZoom() }));
            await page.mouse.move(195, 150); await page.mouse.wheel(0, -240);
            await page.waitForTimeout(600);
            const manual = await page.evaluate(() => ({ center: __map.getCenter(), zoom: __map.getZoom() }));
            check('native wheel changes zoom before moving GPS replay', manual.zoom !== before.zoom, { before, manual });
            await page.evaluate(points => {
                let step = 0;
                window.__gestureGpsTimer = setInterval(() => { __gpsQuiet = false; __gps(points[Math.min(step++, points.length - 1)], 36); __gpsQuiet = true; }, 1000);
            }, points);
            try {
                await page.waitForTimeout(5000);
                const held = await page.evaluate(() => ({ center: __map.getCenter(), zoom: __map.getZoom(), effective: __loc.getState().sample.location }));
                check('manual camera remains fixed during fresh changing GPS within ten seconds', held.zoom === manual.zoom && Math.abs(held.center.lat - manual.center.lat) < .000001 && Math.abs(held.center.lng - manual.center.lng) < .000001 && JSON.stringify(held.effective) !== JSON.stringify(points[0]), { manual, held });
                await page.waitForTimeout(6500);
                const followed = await page.evaluate(() => { const fix = __loc.getState().sample.location, pixel = __map.latLngToContainerPoint([fix.latitude, fix.longitude]); return { zoom: __map.getZoom(), fix, pixel, size: __map.getSize() }; });
                check('camera resumes framing effective GPS after the ten-second follow timer', Math.abs(followed.zoom - 15) < .01 && followed.pixel.x > 0 && followed.pixel.x < followed.size.x && followed.pixel.y > 0 && followed.pixel.y < followed.size.y, followed);
                for (const gesture of ['zoom-limit-wheel', 'stationary-two-finger-touch']) {
                    const initial = await page.evaluate(gesture => {
                        const container = __map.getContainer(), oldMax = __map.getMaxZoom();
                        if (gesture === 'zoom-limit-wheel') { __map.stop(); __map.setZoom(15, { animate: false }); __map.setMaxZoom(15); }
                        else {
                            const touches = [new Touch({ identifier: 1, target: container, clientX: 120, clientY: 100 }), new Touch({ identifier: 2, target: container, clientX: 180, clientY: 100 })];
                            container.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches, targetTouches: touches }));
                            container.dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [], changedTouches: touches }));
                        }
                        return { zoom: __map.getZoom(), oldMax };
                    }, gesture);
                    if (gesture === 'zoom-limit-wheel') { await page.mouse.wheel(0, -240); await page.waitForTimeout(300); }
                    await page.evaluate(() => { __map.panBy([80, 0], { animate: false }); });
                    const paused = await page.evaluate(() => ({ center: __map.getCenter(), zoom: __map.getZoom() }));
                    await page.waitForTimeout(11500);
                    const resumed = await page.evaluate(() => ({ center: __map.getCenter(), zoom: __map.getZoom() }));
                    check(`${gesture} cannot indefinitely pause GPS camera follow`, Math.abs(initial.zoom - paused.zoom) < .01 && Math.abs(resumed.zoom - 15) < .01 && Math.hypot(resumed.center.lat - paused.center.lat, resumed.center.lng - paused.center.lng) > .00001, { initial, paused, resumed });
                    if (gesture === 'zoom-limit-wheel') await page.evaluate(max => { __map.setMaxZoom(max); }, initial.oldMax);
                }
            } finally { await page.evaluate(() => clearInterval(window.__gestureGpsTimer)); }
            await page.evaluate(() => __trip.getState().reset());
        });
        await phase('GeoJSON pan zoom resize and orientation alignment', async () => {
            check('map context found', await getMap());
            const probes = [];
            for (const size of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 360, height: 640 }]) {
                await page.setViewportSize(size);
                await page.evaluate(() => { window.dispatchEvent(new Event('orientationchange')); __map.panBy([90, -40], { animate: true, duration: .25 }); __map.setZoom(14, { animate: true }); });
                await page.waitForTimeout(1200);
                const probe = await page.evaluate(() => {
                    const canvas = document.querySelector('.leaflet-overlay-pane canvas'); const ctx = canvas?.getContext('2d');
                    const data = ctx?.getImageData(0, 0, canvas.width, canvas.height).data; let colored = 0;
                    if (data) for (let i = 3; i < data.length; i += 4) if (data[i] > 0) colored++;
                    const markers = [...document.querySelectorAll('.leaflet-marker-pane > .leaflet-marker-icon')];
                    const mapRect = __map.getContainer().getBoundingClientRect();
                    const worldAlignment = Object.values(__map._layers).filter(layer => layer._latlngs?.[0]?.lat != null && layer._rings?.[0]?.length && layer._renderer?._bounds).map(layer => {
                        const ring = layer._rings[0][0], bounds = layer._renderer._bounds, rect = layer._renderer._container.getBoundingClientRect(), expected = __map.latLngToContainerPoint(layer._latlngs[0]);
                        return Math.hypot(rect.left - mapRect.left + ring.x - bounds.min.x - expected.x, rect.top - mapRect.top + ring.y - bounds.min.y - expected.y);
                    });
                    const mapSize = __map.getSize(); return { canvas: canvas && { width: canvas.width, height: canvas.height, colored }, map: { width: mapSize.x, height: mapSize.y }, worldAlignment, finiteMarkers: markers.every(e => !/NaN|Infinity/.test(e.style.transform)), tileImages: [...document.querySelectorAll('img.leaflet-tile')].filter(e => e.complete && e.naturalWidth > 0).length, paneTransforms: [...document.querySelectorAll('.leaflet-pane')].map(e => e.style.transform) };
                });
                probes.push(probe); check(`GeoJSON canvas nonblank after resize/orientation ${size.width}`, probe.canvas?.colored > 100 && probe.finiteMarkers && probe.map.width === size.width && probe.map.height === size.height && probe.tileImages > 0, probe);
                check(`GeoJSON world coordinates align with rendered canvas ${size.width}`, probe.worldAlignment.length > 0 && probe.worldAlignment.every(error => Number.isFinite(error) && error < 2), probe.worldAlignment);
                await screenshot(`map-panzoom-${size.width}.png`);
            }
            await page.setViewportSize({ width: 390, height: 844 });
            await topOfSheet();
            const before = await page.evaluate(() => ({ center: __map.getCenter(), zoom: __map.getZoom() }));
            await page.mouse.move(195, 150); await page.mouse.down(); await page.mouse.move(250, 180, { steps: 10 }); await page.mouse.up();
            await page.waitForTimeout(500); await page.mouse.wheel(0, -240); await page.waitForTimeout(500);
            const after = await page.evaluate(() => ({ center: __map.getCenter(), zoom: __map.getZoom() }));
            check('pointer drag/wheel operates map without overlay drift error', JSON.stringify(before) !== JSON.stringify(after), { before, after, probes });
        });
        await phase('platform mounted prediction status branches', async () => {
            await page.evaluate(() => { __trip.getState().reset(); __fleet.getState().setSpectatorMode(true); __fleet.getState().selectStation('L1-02'); });
            await retainedPredictions('spectator');
            check('spectator station forecast mounted and absent from map vehicles', (await page.locator('body').innerText()).includes('Forecast') && await page.evaluate(() => __fleet.getState().trains.every(t => t.predictionScope !== 'station')));
            await screenshot('spectator-forecast-390.png');
            await page.evaluate(() => { Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false }); window.dispatchEvent(new Event('offline')); });
            for (const [state, expected] of [['loading', 'Loading'], ['offline', 'Offline'], ['error', 'Estimates Unavailable'], ['stale', 'Stale']]) {
                await page.evaluate(({ state }) => __fleet.setState({ trains: [], stationForecasts: [], predictionState: state, predictionError: 'Fixture estimates error' }), { state });
                await page.waitForTimeout(150);
                const platformBody = await page.locator('body').innerText();
                check(`spectator ${state} is not empty/success`, platformBody.toLowerCase().includes(expected.toLowerCase()), { predictionState: await page.evaluate(() => __fleet.getState().predictionState), body: platformBody.slice(-1400) });
                await screenshot(`spectator-${state}-390.png`);
            }
            await page.evaluate(() => { Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true }); window.dispatchEvent(new Event('online')); });
            await page.evaluate(() => { __fleet.getState().selectStation(null); __fleet.getState().setSpectatorMode(false); });
        });
        await phase('safety dismissal across amendments and reload', async () => {
        const safetyTripId = await page.evaluate(args => {
            window.__gpsQuiet = false;
            __advanceTime(240000);
            __gps(args.origin);
            window.__safetyGpsTimer = setInterval(() => __gps(args.origin), 500);
            __trip.getState().reset(); __trip.setState({ isDevMode: false, authenticatedUserId: null });
            __trip.getState().setOrigin(args.origin); __trip.getState().setDestination(args.destination); __trip.getState().setTicketType('SJT'); __trip.getState().beginTrip();
            const s = __trip.getState();
            __trip.setState({ journeySnapshot: { ...s.journeySnapshot, phase: 'WAITING_AT_ORIGIN', statusCode: 'AT_STATION', estimatorMode: 'LIVE', lastSampleAt: Date.now(), lastTrustedFixAt: Date.now(), hasDepartedOrigin: false } });
            return s.journeySnapshot.tripId;
        }, { origin: station('L1-02'), destination: station('L1-03') });
        const understand = page.getByRole('button', { name: 'I Understand', exact: true });
        await understand.waitFor(); await understand.click(); await page.waitForTimeout(500);
        check('safety dismissal persisted by tripId', await page.evaluate(({ key, tripId }) => JSON.parse(sessionStorage.getItem(key)).some(e => e.tripId === tripId && e.flags.PRE_BOARD), { key: SAFETY_DISMISSALS_KEY, tripId: safetyTripId }));
        await page.evaluate(() => __trip.getState().amendTrip({ ticketType: 'SVC' }));
        await page.waitForTimeout(2500);
        check('amendment preserves dismissed safety reminder', await understand.count() === 0);
        const safetyCheckpoint = await page.evaluate(async () => {
            const db = await new Promise((resolve, reject) => { const request = indexedDB.open('traintracks-runtime', 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
            return new Promise((resolve, reject) => { const tx = db.transaction('key-value', 'readonly'), request = tx.objectStore('key-value').get('trip-checkpoint-v2'); request.onsuccess = () => { resolve(request.result); db.close(); }; request.onerror = () => reject(request.error); });
        });
        check('safety checkpoint is valid before reload', Boolean(parseActiveTripCheckpoint(safetyCheckpoint)), safetyCheckpoint);
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
        await page.getByRole('button', { name: 'Settings Menu' }).waitFor(); await exposeStores();
        await page.waitForTimeout(3500);
        const restoredSafety = await readState('safety-reloaded');
        check('auto-recovered trip does not repeat dismissed safety reminder', restoredSafety.snapshot.tripId === safetyTripId && await understand.count() === 0, { expectedTripId: safetyTripId, actualTripId: restoredSafety.snapshot.tripId, status: restoredSafety.status, reminders: await understand.count(), persistence: await page.evaluate(() => ({ error: __trip.getState().persistenceError, pending: __trip.getState().pendingTripRecovery })) });
        if (restoredSafety.snapshot.tripId !== safetyTripId && parseActiveTripCheckpoint(safetyCheckpoint)) {
            await page.evaluate(checkpoint => __trip.getState().restoreTripCheckpoint(checkpoint), safetyCheckpoint);
            await page.waitForTimeout(2500);
            check('same-trip explicit restore after reload retains component dismissal', await page.evaluate(id => __trip.getState().journeySnapshot.tripId === id, safetyTripId) && await understand.count() === 0);
            output.pending.push('Confirmed reload checkpoint loss in dev Strict Mode before hydration; persistence owner must guard cleanup/visibility writes. Explicit validated restore proves the UI session dismissal survives reload independently.');
        }
        });
        await phase('pending completed receipt quota protection', async () => {
        await page.evaluate(() => {
            const state = __trip.getState();
            __trip.setState({ isDevMode: true, status: 'ARRIVED', journeySnapshot: { ...state.journeySnapshot, phase: 'ARRIVED', completedAt: Date.now(), completedDistanceMeters: 2750 } });
        });
        await page.waitForTimeout(100);
        check('simulation does not save history', await page.evaluate(() => !__trip.getState().pendingCompletedTrip && __trip.getState().historySaveState === 'idle'));
        const retained = await page.evaluate(args => {
            __trip.getState().reset();
            __trip.setState({ isDevMode: false, authenticatedUserId: 'owner-a' });
            __trip.getState().setOrigin(args.origin); __trip.getState().setDestination(args.destination); __trip.getState().setTicketType('SJT'); __trip.getState().beginTrip();
            const realTransaction = IDBDatabase.prototype.transaction, realSetItem = Storage.prototype.setItem;
            IDBDatabase.prototype.transaction = function(stores, mode, ...rest) {
                if (this.name === 'traintracks-outbox-v2' && mode === 'readwrite' && String(stores) === 'outbox') throw new DOMException('Quota fixture', 'QuotaExceededError');
                return realTransaction.call(this, stores, mode, ...rest);
            };
            Storage.prototype.setItem = function(key, value) { if (key.startsWith('traintracks-outbox-v2:item:')) throw new DOMException('Quota fixture', 'QuotaExceededError'); return realSetItem.call(this, key, value); };
            window.__restoreQuota = () => { IDBDatabase.prototype.transaction = realTransaction; Storage.prototype.setItem = realSetItem; };
            const state = __trip.getState();
            __trip.setState({ status: 'ARRIVED', currentStation: args.destination, journeySnapshot: { ...state.journeySnapshot, phase: 'ARRIVED', statusCode: 'ARRIVED', completedAt: Date.now(), completedDistanceMeters: 2750 } });
            const captured = __trip.getState();
            __trip.setState({ authenticatedUserId: 'owner-b' });
            return { state: captured.historySaveState, draft: captured.pendingCompletedTrip };
        }, { origin, destination: target });
        check('completed draft retained synchronously with original owner', retained.state === 'saving' && retained.draft.ownerId === 'owner-a' && retained.draft.distance_km === 2.75, retained);
        await page.waitForFunction(() => __trip.getState().historySaveState === 'failed');
        const endTrip = page.getByRole('button', { name: 'END TRIP', exact: true });
        check('quota failure retains receipt and disables reset', await endTrip.isDisabled() && (await page.locator('body').innerText()).includes('History not queued; receipt retained'));
        check('pending receipt prevents unload', await page.evaluate(() => { const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; }));
        await page.waitForTimeout(61000);
        const retainedAfterTimer = await page.evaluate(() => ({ status: __trip.getState().status, draft: __trip.getState().pendingCompletedTrip, state: __trip.getState().historySaveState, error: __trip.getState().historySaveError, origin: __trip.getState().origin?.id, body: document.body.innerText.slice(-2000), receiptCount: [...document.querySelectorAll('button')].filter(e => e.innerText === 'END TRIP').length }));
        check('failed receipt survives auto-close interval', await endTrip.isVisible() && retainedAfterTimer.status === 'ARRIVED' && retainedAfterTimer.draft?.ownerId === 'owner-a', { ...retainedAfterTimer, visible: await endTrip.isVisible() });
        await page.evaluate(() => { __restoreQuota(); __trip.getState().discardCompletedTrip(); __trip.getState().reset(); });
        });
        await phase('cross-line completed history uses entry-line direction', async () => {
            for (const [fromId, toId] of [['L1-20', 'L2-13'], ['L2-13', 'L1-20']]) {
                const initial = await begin(station(fromId), station(toId));
                const completed = reduceJourneySnapshot(initial, { type: 'SNAP_TO_STATION', stationId: toId });
                const captured = await page.evaluate(snapshot => {
                    __trip.getState().syncJourneySnapshot(snapshot);
                    const state = __trip.getState(); return { draft: state.pendingCompletedTrip, finalDirection: state.direction };
                }, completed);
                check(`history draft ${fromId}->${toId} records entry direction`, captured.draft?.direction === getJourneyEntryDirection(initial.route) && captured.draft.line_id === station(fromId).lineId, captured);
                await page.waitForFunction(() => __trip.getState().historySaveState === 'queued');
                await page.evaluate(() => __trip.getState().reset());
            }
        });
        await phase('animation-enabled normal and 4x CPU profiles', async () => {
            const trip = await begin(origin, station('M3-10'));
            const edge = trip.route.edges[0], geometry = getJourneyRailEdgePath(edge, station(edge.fromStationId), station(edge.toStationId));
            const length = getPolylineLengthMeters(geometry);
            const points = Array.from({ length: 80 }, (_, index) => interpolatePolyline(geometry, length * Math.min(.85, .25 + index * .006)));
            const fleet = [['L1-20', 'L1-19'], ['L1-18', 'L1-17'], ['L1-15', 'L1-14'], ['L2-13', 'L2-12'], ['L2-10', 'L2-09'], ['M3-13', 'M3-12']].map(([fromId, toId], index) => {
                const from = station(fromId), to = station(toId), route = buildJourneyRoute(from, to);
                const path = getJourneyRailEdgePath(route.edges[0], from, to), meters = getPolylineLengthMeters(path);
                return { id: `profile-crowd-${index}`, lineId: from.lineId, direction: getJourneyEntryDirection(route), stationId: from.id, stationName: from.name, points: Array.from({ length: 80 }, (_, tick) => interpolatePolyline(path, meters * Math.min(.8, .1 + tick * .006))) };
            });
            await page.evaluate(() => __advanceTime(21000));
            const moving = reduceJourneySnapshot(trip, { type: 'LOCATION_SAMPLE', location: points[0], speedKph: 36, gpsAccuracy: 5, timestamp: await page.evaluate(() => Date.now()), source: 'gps' });
            await sync(moving);
            await page.evaluate(({ points, fleet }) => {
                __fleet.getState().setSpectatorMode(false);
                __trip.setState({ isDevMode: false });
                let step = 0;
                const publish = () => {
                    const point = points[Math.min(step++, points.length - 1)];
                    __gpsQuiet = false; __gps(point, 36); __gpsQuiet = true;
                    for (const train of fleet) {
                        const position = train.points[Math.min(step, train.points.length - 1)];
                        __fleet.getState().upsertTrain({ id: train.id, lineId: train.lineId, direction: train.direction, stationId: train.stationId, stationName: train.stationName, lat: position.latitude, lng: position.longitude, source: 'crowd', statusCode: 'IN_TRANSIT', speedKph: 36, confidence: .9, updatedAt: Date.now(), sampleId: `${train.id}-${step}` });
                    }
                };
                publish(); window.__profileFleetTimer = setInterval(publish, 1000);
            }, { points, fleet });
            await page.waitForTimeout(2000);
            const clickProfileSettings = async prepareMeasurement => {
                for (let attempt = 0; attempt < 3; attempt++) {
                    const reminder = page.getByRole('button', { name: 'I Understand', exact: true });
                    if (await reminder.isVisible()) { await reminder.click(); await page.waitForTimeout(350); }
                    if (prepareMeasurement) await page.evaluate(() => {
                        if (window.__measureProfileClick) document.removeEventListener('click', __measureProfileClick, true);
                        window.__inputMeasured = new Promise(resolve => {
                            window.__measureProfileClick = () => { const eventAt = performance.now(); requestAnimationFrame(() => requestAnimationFrame(() => resolve({ driverMs: performance.now() - window.__inputStart, eventMs: performance.now() - eventAt }))); };
                            document.addEventListener('click', __measureProfileClick, { once: true, capture: true });
                        });
                        window.__inputStart = performance.now();
                    });
                    try { await page.getByRole('button', { name: 'Settings Menu' }).click({ timeout: 2000 }); return; }
                    catch (error) {
                        await page.evaluate(() => { if (window.__measureProfileClick) document.removeEventListener('click', __measureProfileClick, true); });
                        if (!await reminder.isVisible()) throw error;
                    }
                }
                throw new Error('Safety reminder did not settle before the measured settings action.');
            };
            for (const rate of [1, 4]) {
                await cdp.send('Emulation.setCPUThrottlingRate', { rate });
                await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: rate === 4 ? 150 : 0, downloadThroughput: rate === 4 ? 200000 : -1, uploadThroughput: rate === 4 ? 93750 : -1 });
                await cdp.send('Profiler.enable'); await cdp.send('Profiler.start');
                const bytesBefore = networkBytes, requestsBefore = networkRequests;
                await topOfSheet();
                const fleetBefore = await page.locator('.train-marker-icon').evaluateAll(elements => elements.map(e => e.style.transform));
                const frames = await page.evaluate(() => new Promise(resolve => {
                    const gaps = [], start = performance.now(); let last;
                    const tick = now => { if (last != null) gaps.push(now - last); last = now; if (now - start >= 5000) resolve({ gaps, wallMs: now - start, animations: document.getAnimations().filter(a => a.playState === 'running').length, longTasks: __longTasks.slice(-50) }); else requestAnimationFrame(tick); };
                    requestAnimationFrame(tick);
                }));
                const latencies = [], eventLatencies = [];
                for (let i = 0; i < 5; i++) {
                    await clickProfileSettings(true);
                    const latency = await page.evaluate(() => __inputMeasured);
                    latencies.push(latency.driverMs); eventLatencies.push(latency.eventMs);
                }
                if (await page.getByRole('button', { name: 'Settings Menu' }).getAttribute('aria-expanded') === 'true') await clickProfileSettings(false);
                const profile = (await cdp.send('Profiler.stop')).profile;
                fs.writeFileSync(path.join(OUTPUT, `cpu-${rate}x.json`), JSON.stringify(profile));
                const sorted = [...frames.gaps].sort((a, b) => a - b);
                const percentile = p => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
                const fleetAfter = await page.locator('.train-marker-icon').evaluateAll(elements => elements.map(e => e.style.transform));
                const workload = await page.evaluate(() => ({ movingFleet: __fleet.getState().rawTrains.filter(t => t.id.startsWith('profile-crowd') && t.statusCode === 'IN_TRANSIT').length, clusteredFleet: __fleet.getState().trains.filter(t => t.source === 'crowd' && t.statusCode === 'IN_TRANSIT').length, journey: __trip.getState().journeySnapshot.statusCode, effectiveSpeed: __loc.getState().sample?.speedKph }));
                output.profiles.push({ rate, environment: `${production ? 'production webpack fixture' : 'development webpack fixture'}; real animations; mocked predictions and six moving crowd samples; fresh mocked journey GPS; not hardware guarantees`, workload: { ...workload, mountedMarkers: fleetAfter.length, markerTransformsChanged: JSON.stringify(fleetBefore) !== JSON.stringify(fleetAfter) }, frames: { samples: sorted.length, wallMs: frames.wallMs, medianMs: percentile(.5), p95Ms: percentile(.95), maxMs: Math.max(...sorted), over50ms: sorted.filter(t => t > 50).length }, runningAnimations: frames.animations, driverDispatchToTwoFramesMs: latencies, clickEventToTwoFramesMs: eventLatencies, longTasks: frames.longTasks, network: { encodedBytes: networkBytes - bytesBefore, requests: networkRequests - requestsBefore, resources: await page.evaluate(() => performance.getEntriesByType('resource').reduce((sum, e) => ({ requests: sum.requests + 1, transferSize: sum.transferSize + e.transferSize, decodedBodySize: sum.decodedBodySize + e.decodedBodySize }), { requests: 0, transferSize: 0, decodedBodySize: 0 })) }, hotspots: profile.nodes.filter(n => n.hitCount).sort((a, b) => b.hitCount - a.hitCount).slice(0, 15).map(n => ({ name: n.callFrame.functionName, url: n.callFrame.url.split('?')[0], line: n.callFrame.lineNumber + 1, hits: n.hitCount })) });
                check(`profile capture ${rate}x kept real animation frames`, sorted.length > 0 && frames.animations > 0, output.profiles.at(-1).frames);
                check(`profile capture ${rate}x has moving fleet and journey workload`, workload.movingFleet >= 3 && fleetAfter.length >= 3 && JSON.stringify(fleetBefore) !== JSON.stringify(fleetAfter) && workload.effectiveSpeed > 0, output.profiles.at(-1).workload);
            }
            await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
            await page.evaluate(() => clearInterval(window.__profileFleetTimer));
        });
        output.network = { encodedBytes: networkBytes, requests: networkRequests, tileReads: tileCache.size };
        const accessibility = await page.evaluate(() => ({ unnamedButtons: [...document.querySelectorAll('button')].filter(e => !e.innerText.trim() && !e.getAttribute('aria-label') && !e.title).map(e => e.outerHTML.slice(0, 180)), viewport: document.querySelector('meta[name="viewport"]')?.content, dialogs: [...document.querySelectorAll('[role="dialog"]')].map(e => ({ name: e.getAttribute('aria-label') ?? e.getAttribute('aria-labelledby'), focusInside: e.contains(document.activeElement) })) }));
        output.accessibility = accessibility;
        check('viewport allows user scaling', !/user-scalable=no|maximum-scale=1(?:,|$)/.test(accessibility.viewport ?? ''), accessibility.viewport);
        await phase('mounted denied GPS and initial onboarding branches', async () => {
            const scanning = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, timezoneId: 'Asia/Manila', userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36' });
            await scanning.addInitScript(clockFixture);
            await scanning.addInitScript(workerFixture);
            await scanning.route('**/*', routeHandler);
            await scanning.addInitScript(() => {
                const denied = () => ({ code: 1, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3, message: 'Fixture location denied' });
                navigator.geolocation.getCurrentPosition = (_success, error) => error(denied());
                navigator.geolocation.watchPosition = (_success, error) => { error(denied()); return 1; };
                navigator.geolocation.clearWatch = () => {};
                window.Notification = class { static permission = 'denied'; };
            });
            const denied = await scanning.newPage(); denied.on('pageerror', error => output.errors.push(error.message));
            await denied.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded' });
            await denied.getByRole('button', { name: 'Tell me more', exact: true }).waitFor({ timeout: 60000 });
            const onboardingText = await denied.locator('body').innerText();
            check('initial welcome screen mounted without false accelerometer claim', /Welcome|TrainTracks/i.test(onboardingText) && !/accelerometer fusion/i.test(onboardingText));
            await denied.screenshot({ path: path.join(OUTPUT, 'welcome-gps-denied-390.png') }); output.screenshots.push(path.join(OUTPUT, 'welcome-gps-denied-390.png'));
            await denied.getByRole('button', { name: 'Tell me more', exact: true }).click();
            await denied.getByRole('button', { name: "Let's Go!", exact: true }).click();
            await denied.getByText('Location Blocked', { exact: true }).waitFor({ timeout: 60000 });
            const deniedText = await denied.locator('body').innerText();
            check('denied GPS mounted as blocking status, not successful scan', /Location (Blocked|Permission)|location access|permission.*blocked/i.test(deniedText) && !/STATION DETECTED/.test(deniedText), deniedText.slice(-1800));
            const retry = denied.getByRole('button', { name: 'Retry Location', exact: true });
            if (await retry.count()) { await retry.click(); await denied.waitForTimeout(250); check('existing GPS retry retains real denial', /blocked|permission|location access/i.test(await denied.locator('body').innerText())); }
            await denied.screenshot({ path: path.join(OUTPUT, 'scanning-gps-denied-390.png') }); output.screenshots.push(path.join(OUTPUT, 'scanning-gps-denied-390.png'));
            await scanning.close();
        });
        await phase('production desktop restriction', async () => {
            const desktop = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 800 } });
            await desktop.addInitScript(clockFixture);
            await desktop.addInitScript(workerFixture);
            await desktop.route('**/*', routeHandler);
            await desktop.addInitScript(() => localStorage.setItem('traintracks_welcome_seen', 'true'));
            const guarded = await desktop.newPage();
            await guarded.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded' });
            const heading = guarded.getByRole('heading', { name: 'Handheld Device Required', exact: true });
            await heading.waitFor();
            await guarded.locator('[aria-label="Settings Menu"]').waitFor({ state: 'attached', timeout: 60000 });
            const text = await guarded.locator('body').innerText();
            const coversControls = await heading.evaluate(e => {
                const guard = e.parentElement, button = document.querySelector('[aria-label="Settings Menu"]'), bounds = guard.getBoundingClientRect(), target = button?.getBoundingClientRect();
                const hit = target && document.elementFromPoint(target.left + target.width / 2, target.top + target.height / 2);
                return bounds.width === innerWidth && bounds.height === innerHeight && hit && guard.contains(hit);
            });
            let pointerBlocked = false;
            try { await guarded.locator('[aria-label="Settings Menu"]').click({ trial: true, timeout: 800 }); } catch { pointerBlocked = true; }
            check('production desktop handheld gate covers and blocks pointer controls', coversControls && pointerBlocked, { text: text.slice(0, 1800), coversControls, pointerBlocked });
            const root = guarded.locator('#traintracks-app-root');
            const beforeMenu = await guarded.locator('[aria-label="Settings Menu"]').getAttribute('aria-expanded');
            const tabTargets = [];
            for (let index = 0; index < 12; index++) { await guarded.keyboard.press('Tab'); tabTargets.push(await guarded.evaluate(() => document.getElementById('traintracks-app-root').contains(document.activeElement))); await guarded.keyboard.press('Enter'); }
            check('desktop background controls excluded from roles and keyboard activation', await guarded.getByRole('button', { name: 'Settings Menu' }).count() === 0 && await root.evaluate(e => e.inert && e.getAttribute('aria-hidden') === 'true') && tabTargets.every(target => !target) && await guarded.locator('[aria-label="Settings Menu"]').getAttribute('aria-expanded') === beforeMenu, { tabTargets, beforeMenu });
            const file = path.join(OUTPUT, 'production-desktop-guard.png');
            await guarded.screenshot({ path: file }); output.screenshots.push(file);
            await guarded.evaluate(() => {
                let runtime; webpackChunk_N_E.push([[Date.now()], {}, r => runtime = r]);
                for (const [id, factory] of Object.entries(runtime.m)) {
                    if (!factory.toString().includes('resumePendingTrip')) continue;
                    try { for (const value of Object.values(runtime(id))) if (value?.getState?.().journeySnapshot) window.__guardTrip = value; } catch {}
                }
                if (!window.__guardTrip) throw new Error('Guard fixture store unavailable');
                __guardTrip.setState({ isDevMode: true });
            });
            await guarded.waitForFunction(() => !document.getElementById('traintracks-app-root').inert);
            check('device guard restores prior attributes for developer bypass', await root.getAttribute('aria-hidden') === null && await guarded.getByRole('button', { name: 'Settings Menu' }).count() === 1);
            await guarded.evaluate(() => __guardTrip.setState({ isDevMode: false }));
            await guarded.waitForFunction(() => document.getElementById('traintracks-app-root').inert);
            check('device guard re-applies isolation after bypass ends', await root.getAttribute('aria-hidden') === 'true');
            await guarded.goto(BASE_URL + '/docs', { waitUntil: 'domcontentloaded' });
            check('existing docs route exempt from handheld policy', await guarded.locator('#traintracks-app-root').evaluate(e => !e.inert && !e.hasAttribute('aria-hidden')));
            await desktop.close();
        });
        await phase('production mobile cookie restriction', async () => {
            const cookies = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36' });
            await cookies.addInitScript(clockFixture);
            await cookies.addInitScript(workerFixture);
            await cookies.route('**/*', routeHandler);
            await cookies.addInitScript(() => Object.defineProperty(navigator, 'cookieEnabled', { get: () => false }));
            const blocked = await cookies.newPage();
            await blocked.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded' });
            const heading = blocked.getByRole('heading', { name: 'Cookies Required', exact: true });
            await heading.waitFor();
            check('production mobile cookie-denied gate mounted', await heading.isVisible() && /ERROR_COOKIES_DISABLED/.test(await blocked.locator('body').innerText()));
            check('cookie-denied background controls inert and inaccessible', await blocked.locator('#traintracks-app-root').evaluate(e => e.inert && e.getAttribute('aria-hidden') === 'true') && await blocked.getByRole('button', { name: 'Settings Menu' }).count() === 0);
            const file = path.join(OUTPUT, 'production-cookie-guard-390.png');
            await blocked.screenshot({ path: file }); output.screenshots.push(file);
            await cookies.close();
        });
        }
        check('no uncaught page errors', output.errors.length === 0, output.errors);
        await context.close();
    } catch (error) { output.fatal = error.stack; } finally { await browser.close(); fs.writeFileSync(path.join(OUTPUT, 'results.json'), JSON.stringify(output, null, 2)); }
        console.log(JSON.stringify({ checks: output.checks.map(({ name, pass }) => ({ name, pass })), failed: output.checks.filter(c => !c.pass), errors: output.errors, screenshots: output.screenshots.length, profiles: output.profiles.map(p => ({ rate: p.rate, frames: p.frames, clickEventToTwoFramesMs: p.clickEventToTwoFramesMs, network: p.network })), pending: output.pending, fatal: output.fatal }, null, 2));
    if (output.fatal || output.checks.some(c => !c.pass)) process.exitCode = 1;
}
pwaGateChecks().then(() => process.env.FRONTEND_REPAIR_UNIT_ONLY === '1' ? undefined : browserChecks()).catch(error => { console.error(error); process.exitCode = 1; });
