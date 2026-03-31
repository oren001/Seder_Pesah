const https = require('https');
const http = require('http');

const LIVE_TARGET = 'https://pesach-yachad.onrender.com';
const LOCAL_TARGET = 'http://localhost:3004';
const ROOM_ID = '5drrkj';

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        const h = url.startsWith('https') ? https : http;
        h.get(url, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => resolve(JSON.parse(data)));
        }).on('error', reject);
    });
}

function postJson(url, body) {
    return new Promise((resolve, reject) => {
        const h = url.startsWith('https') ? https : http;
        const payload = JSON.stringify(body);
        const req = h.request(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
        }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => resolve({ status: res.statusCode, data }));
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

async function main() {
    console.log("=== PUSHING LOCAL IMAGES TO LIVE RENDER SERVER ===");
    
    // 1. Fetch images from local JSON export
    console.log(`\n📌 1. Fetching exported images from local server...`);
    let exportData;
    try {
        exportData = await fetchJson(`${LOCAL_TARGET}/api/admin/export-images?roomId=${ROOM_ID}&secret=pesach2026`);
        console.log(`Found ${exportData.count || 0} images in local cache!`);
    } catch (e) {
        console.error("❌ Failed to contact local server. Is it running?", e.message);
        return;
    }

    if (!exportData.images || exportData.count === 0) {
        console.log("⚠️ No images found locally. Nothing to push.");
        return;
    }

    // 2. Push directly to Render
    console.log(`\n📌 2. Injecting ${exportData.count} images via secure import endpoint to Render...`);
    try {
        const res = await postJson(`${LIVE_TARGET}/api/admin/import-images`, {
            roomId: ROOM_ID,
            secret: 'pesach2026',
            images: exportData.images
        });
        
        if (res.status === 200) {
            console.log(`✅ SUCCESS! Render returned: ${res.data}`);
            console.log("\n🎉 ALL DONE! Your phone and all Seder participants are now instantly synced!");
        } else {
            console.log(`❌ Render rejected with status ${res.status}: ${res.data}`);
        }
    } catch (e) {
        console.error("❌ Failed to push to Render:", e.message);
    }
}

main();
