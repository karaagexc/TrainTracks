const token = process.env.TRAINSIGHT_TOKEN;
const clientId = process.env.TRAINSIGHT_CLIENT_ID;

if (!token || !clientId) {
    console.error("Missing TRAINSIGHT_TOKEN or TRAINSIGHT_CLIENT_ID.");
    process.exit(1);
}

async function run() {
    console.log("Calling TrainSight API at /api/data/trains...");
    const start = Date.now();
    try {
        const res = await fetch('https://core.trainsight.app/api/data/trains', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
                api_key: token,
                user_id: clientId,
            }),
            cache: 'no-store',
        });

        console.log(`Status: ${res.status}`);
        const data = await res.text();
        console.log(`Time taken: ${Date.now() - start}ms`);
        console.log(`Response length: ${data.length}`);
        console.log("Response preview:", data.slice(0, 500));
    } catch (e) {
        console.error("Error:", e);
    }
}

run();
