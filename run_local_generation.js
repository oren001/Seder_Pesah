const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const LIVE_TARGET = 'https://pesach-yachad.onrender.com';
const LOCAL_TARGET = 'http://localhost:3004';
const ROOM_ID = '5drrkj';
const SELFIES_DIR = 'C:/Users/oren weiss/Desktop/backup/selfies';

function post(url, body) {
    return new Promise((resolve, reject) => {
        const h = url.startsWith('https') ? https : http;
        const payload = JSON.stringify(body);
        const req = h.request(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
        }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => resolve({ status: res.statusCode, body: data }));
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

async function main() {
    console.log("=== SHIFTING POWER TO YOUR LAPTOP ===");
    
    // 1. Register to localhost
    const files = fs.readdirSync(SELFIES_DIR);
    console.log(`\n📌 1. Registering ${files.length} participants to Local Server...`);
    let count = 0;
    for (const f of files) {
        if (!f.endsWith('.jpg') || f.startsWith('.')) continue;
        const name = f.replace('_selfie.jpg', '').replace('.jpg', '');
        let fileData;
        try { fileData = fs.readFileSync(path.join(SELFIES_DIR, f)); } catch(e) { continue; }
        
        const photoStr = `data:image/jpeg;base64,${fileData.toString('base64')}`;
        const nameActual = name === 'danny' ? 'דני' : name;
        
        const r = await post(`${LOCAL_TARGET}/api/pre-register`, {
            roomId: ROOM_ID, name: nameActual, photo: photoStr, role: null
        });
        if (r.status === 200) count++;
    }
    
    // Danny fallback
    try {
        const dannyPath = 'C:/Users/oren weiss/Pessover Invitation/public/images/danny.jpg';
        if (fs.existsSync(dannyPath) && !files.some(f => f.includes('דני') || f.includes('danny'))) {
            const data = fs.readFileSync(dannyPath);
            await post(`${LOCAL_TARGET}/api/pre-register`, {
                roomId: ROOM_ID, name: 'דני', photo: `data:image/jpeg;base64,${data.toString('base64')}`, role: null
            });
            count++;
        }
    } catch(e) {}
    console.log(`✅ Registered ${count} participants to localhost.`);

    // 2. Trigger Parallel Generation on localhost
    console.log(`\n📌 2. Triggering Parallel AI Generation on Local Server...`);
    const genRes = await post(`${LOCAL_TARGET}/api/admin/generate-all-pages`, {
        roomId: ROOM_ID, secret: 'pesach2026', force: true
    });
    console.log(genRes.status === 200 ? '✅ Generation STARTED in background on node server!' : '❌ Failed: ' + genRes.body);
    
    console.log('\n⏳ PLEASE WAIT... Watch your other terminal running "node server.js"');
    console.log('⏳ Once it prints "Bulk generation complete", run the script: node push_to_live.js');
}

main();
