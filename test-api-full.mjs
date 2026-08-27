const TOKEN = process.env.TRAINSIGHT_TOKEN;
const CLIENT_ID = process.env.TRAINSIGHT_CLIENT_ID;
const BASE = "https://core.trainsight.app";

if (!TOKEN || !CLIENT_ID) {
    console.error("Missing TRAINSIGHT_TOKEN or TRAINSIGHT_CLIENT_ID.");
    process.exit(1);
}

function mask(value) {
    return `${value.substring(0, 6)}...${value.substring(value.length - 4)}`;
}

async function test(label, url, opts = {}) {
    const start = Date.now();
    try {
        const res = await fetch(url, opts);
        const ms = Date.now() - start;
        const body = await res.text();
        console.log(`\n[${label}]`);
        console.log(`  Status: ${res.status} ${res.statusText}`);
        console.log(`  Time: ${ms}ms`);
        console.log(`  Body: ${body.substring(0, 300)}`);
    } catch (e) {
        console.log(`\n[${label}] ERROR: ${e.message}`);
    }
}

async function run() {
    console.log("=== TrainSight API Access Diagnostic ===");
    console.log(`Time: ${new Date().toISOString()}`);
    console.log(`Token: ${mask(TOKEN)}`);
    console.log(`Client: ${mask(CLIENT_ID)}`);

    await test("1. Root (no auth)", `${BASE}/`);
    await test("2. GET /api/stations (no auth)", `${BASE}/api/stations`);
    await test("3. GET /api/fleetSize (Bearer)", `${BASE}/api/fleetSize`, {
        headers: { Authorization: `Bearer ${TOKEN}` }
    });
    await test("4. POST /api/public/trains (api_key+user_id)", `${BASE}/api/public/trains`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
        body: JSON.stringify({ api_key: TOKEN, user_id: CLIENT_ID })
    });
    await test("5. POST /api/public/trains (api_key only, no Bearer)", `${BASE}/api/public/trains`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: TOKEN, user_id: CLIENT_ID })
    });
    await test("6. POST /api/data/trains (documented)", `${BASE}/api/data/trains`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
        body: JSON.stringify({ api_key: TOKEN, user_id: CLIENT_ID })
    });
    await test("7. POST /api/public/trains (token in body)", `${BASE}/api/public/trains`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: TOKEN, api_key: TOKEN, user_id: CLIENT_ID })
    });
    await test("8. POST /api/public/trains (empty)", `${BASE}/api/public/trains`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
    });
    await test("9. GET /api/public/trains", `${BASE}/api/public/trains`, {
        headers: { Authorization: `Bearer ${TOKEN}` }
    });
    await test("10. GET /api/schedule_data", `${BASE}/api/schedule_data`, {
        headers: { Authorization: `Bearer ${TOKEN}` }
    });

    console.log("\n=== Done ===");
}

run();
