#!/usr/bin/env node
/**
 * migrate_participants.js
 * Copies all pre-registered participants from pesach-invitation-app → pesach-yachad
 * Run once before the seder: node migrate_participants.js
 */

const https = require('https');
const http  = require('http');

const SOURCE = 'https://pesach-invitation-app.onrender.com';
const TARGET = 'https://pesach-yachad.onrender.com';
const ROOM_ID = '5drrkj';

function get(url) {
    return new Promise((resolve, reject) => {
        const lib = url.startsWith('https') ? https : http;
        lib.get(url, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
                catch { resolve({ status: res.statusCode, body: data }); }
            });
        }).on('error', reject);
    });
}

function post(url, body) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify(body);
        const parsed  = new URL(url);
        const lib     = parsed.protocol === 'https:' ? https : http;
        const req = lib.request(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
        }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
                catch { resolve({ status: res.statusCode, body: data }); }
            });
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

async function main() {
    console.log('🍷 Migrating participants from pesach-invitation-app → pesach-yachad');
    console.log(`   Room: ${ROOM_ID}\n`);

    // 1. Fetch participants from source
    console.log('📥 Fetching participants from source...');
    const res = await get(`${SOURCE}/api/rooms/${ROOM_ID}`);
    if (res.status !== 200 || !res.body.participants) {
        console.error('❌ Could not fetch room:', res.status, res.body);
        process.exit(1);
    }
    const participants = res.body.participants;
    console.log(`   Found ${participants.length} participants\n`);

    // 2. Register each on target
    let ok = 0, fail = 0;
    for (const p of participants) {
        if (!p.name) continue;
        process.stdout.write(`   👤 ${p.name}... `);
        try {
            const r = await post(`${TARGET}/api/pre-register`, {
                roomId: ROOM_ID,
                name:   p.name,
                photo:  p.photo || null,
                role:   p.role  || null,
            });
            if (r.status === 200 && r.body.success) {
                console.log('✅');
                ok++;
            } else {
                console.log('❌', r.status, JSON.stringify(r.body).substring(0, 80));
                fail++;
            }
        } catch (e) {
            console.log('❌ Error:', e.message);
            fail++;
        }
    }

    console.log(`\n✅ Done: ${ok} registered, ${fail} failed`);
    console.log(`\n🎉 Haggadah reader ready at:\n   ${TARGET}/?room=${ROOM_ID}`);
}

main().catch(err => { console.error(err); process.exit(1); });
