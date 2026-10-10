import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { spawn } from 'node:child_process';
import ts from 'typescript';

const chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
assert.ok(fs.existsSync(chromePath), 'Chrome is required for the isolated browser lease/worker test');
const root = process.cwd();
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'traintracks-crowd-browser-'));
const files = new Map([
    ['/lease.js', 'src/domain/crowd/lease.ts'],
    ['/domain/predictions/snapshot', 'src/domain/predictions/snapshot.ts'],
    ['/workers/predictions.worker.js', 'src/workers/predictions.worker.ts'],
]);
const server = http.createServer((request, response) => {
    const file = files.get(request.url);
    if (!file) { response.writeHead(200, { 'Content-Type': 'text/html' }); response.end('<!doctype html><title>Isolated crowd test</title>'); return; }
    response.writeHead(200, { 'Content-Type': 'text/javascript' });
    response.end(ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 },
    }).outputText);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const chrome = spawn(chromePath, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
let socket;
let requestId = 0;
const pending = new Map();
let stderr = '';
const endpointPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Chrome startup timed out: ${stderr.slice(-300)}`)), 20_000);
    chrome.on('error', error => { clearTimeout(timeout); reject(error); });
    chrome.stderr.on('data', chunk => {
        stderr += chunk;
        const match = stderr.match(/DevTools listening on (ws:\/\/\S+)/);
        if (match) { clearTimeout(timeout); resolve(match[1]); }
    });
});
async function call(method, params = {}, sessionId) {
    const id = ++requestId;
    return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
}
async function evaluate(sessionId, expression) {
    const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
}
try {
    const endpoint = await endpointPromise;
    socket = new WebSocket(endpoint);
    await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
    socket.addEventListener('message', ({ data }) => {
        const message = JSON.parse(String(data));
        if (!message.id) return;
        const item = pending.get(message.id); pending.delete(message.id);
        if (message.error) item?.reject(new Error(JSON.stringify(message.error)));
        else item?.resolve(message.result);
    });
    const sessions = [];
    for (let i = 0; i < 2; i++) {
        const { targetId } = await call('Target.createTarget', { url: origin });
        const { sessionId } = await call('Target.attachToTarget', { targetId, flatten: true });
        sessions.push(sessionId);
        await call('Page.enable', {}, sessionId);
        await call('Page.navigate', { url: origin }, sessionId);
        for (let attempt = 0; attempt < 100; attempt++) {
            if (await evaluate(sessionId, `location.origin === ${JSON.stringify(origin)} && document.readyState === 'complete'`)) break;
            await new Promise(resolve => setTimeout(resolve, 20));
        }
        await evaluate(sessionId, "import('/lease.js').then(module => { window.lease = module; return true; })");
    }
    const identities = await Promise.all(sessions.map(session => evaluate(session, 'lease.getAnonymousCrowdDeviceId()')));
    assert.ok(identities[0]);
    assert.equal(identities[0], identities[1], 'first-run identity creation is serialized across tabs');
    for (let round = 0; round < 20; round++) {
        if (round === 10) for (const session of sessions) {
            await evaluate(session, "Object.defineProperty(navigator, 'locks', { value: undefined }); true");
        }
        const device = `same-device-${round}`;
        const results = await Promise.all(sessions.map((session, i) => evaluate(session,
            `lease.claimCrowdLease('${device}', 'tab-${i}', 30000)`)));
        assert.equal(results.filter(Boolean).length, 1, 'exactly one tab must acquire the IDB/Web Locks lease');
        const winner = results.indexOf(true); const loser = 1 - winner;
        await evaluate(sessions[loser], `lease.releaseCrowdLease('${device}', 'tab-${loser}')`);
        assert.equal(await evaluate(sessions[loser], `lease.claimCrowdLease('${device}', 'tab-${loser}', 30000)`), false,
            'a nonowner cannot release another tab lease');
        await evaluate(sessions[winner], `lease.releaseCrowdLease('${device}', 'tab-${winner}')`);
        assert.equal(await evaluate(sessions[loser], `lease.claimCrowdLease('${device}', 'tab-${loser}', 30000)`), true,
            'the second tab recovers after owner release');
        await evaluate(sessions[loser], `lease.releaseCrowdLease('${device}', 'tab-${loser}')`);
    }
    const workerResult = await evaluate(sessions[0], `new Promise((resolve, reject) => {
        const worker = new Worker('/workers/predictions.worker.js', { type: 'module' });
        const now = Date.now();
        worker.onerror = event => { worker.terminate(); reject(new Error(event.message)); };
        worker.onmessage = ({data}) => { worker.terminate(); resolve({ ...data, originalAt: now - 30000 }); };
        worker.postMessage({ context: 7, revision: 3, now, snapshots: [{key:'station',receivedAt:now - 30000,response:{
            generatedAt:new Date(now - 30000).toISOString(), predictions:[{
                id:'forecast',source:'predicted',predictionScope:'station',updatedAt:now - 30000,
                arrivalTime:new Date(now + 60000).toISOString(),departureTime:new Date(now + 90000).toISOString()
            }]
        }}] });
    })`);
    assert.equal(workerResult.context, 7);
    assert.equal(workerResult.revision, 3);
    assert.equal(workerResult.forecasts.length, 1);
    assert.equal(workerResult.forecasts[0].updatedAt, workerResult.originalAt);
    assert.equal(workerResult.forecasts[0].freshness, 'stale');
    assert.equal(workerResult.forecasts[0].etaSeconds, 60);
    console.log('Browser crowd repair passed: 20 concurrent cross-tab lease rounds (Web Locks + IDB-only) and real dedicated-worker forecasts.');
} finally {
    if (socket?.readyState === WebSocket.OPEN) {
        await call('Browser.close').catch(() => {}); socket.close();
    }
    if (chrome.exitCode === null) {
        await Promise.race([new Promise(resolve => chrome.once('exit', resolve)), new Promise(resolve => setTimeout(resolve, 5000))]);
    }
    if (chrome.exitCode === null) chrome.kill();
    await new Promise(resolve => server.close(resolve));
    const resolvedProfile = path.resolve(profile);
    if (resolvedProfile.startsWith(path.resolve(os.tmpdir()) + path.sep)
        && path.basename(resolvedProfile).startsWith('traintracks-crowd-browser-')) {
        fs.rmSync(resolvedProfile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
}
