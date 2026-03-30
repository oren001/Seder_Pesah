#!/usr/bin/env node
/**
 * setup_room.js
 * Registers Danny Krio as the Rasha in room 5drrkj and starts the seder.
 *
 * Usage:
 *   node setup_room.js
 *
 * Requires the server to be deployed first.
 */

const fs   = require('fs');
const path = require('path');
const https = require('https');
const http  = require('http');

const SERVER      = 'https://pesach-invitation-app.onrender.com';
const ROOM_ID     = '5drrkj';
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'pesach2026';

// Danny's selfie path
const SELFIE_PATH = path.join(
    'C:', 'Users', 'oren weiss', 'Pictures', 'Screenshots',
    'Screenshot 2026-03-30 145213.png'
);

// ── Helpers ────────────────────────────────────────────────────────────────

function toBase64(filePath) {
    const ext  = path.extname(filePath).slice(1).toLowerCase();
    const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
    const data = fs.readFileSync(filePath);
    return `data:${mime};base64,${data.toString('base64')}`;
}

function post(url, body) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify(body);
        const parsed  = new URL(url);
        const lib     = parsed.protocol === 'https:' ? https : http;

        const req = lib.request(url, {
            method: 'POST',
            headers: {
                'Content-Type':   'application/json',
                'Content-Length': Buffer.byteLength(payload),
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
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

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
    console.log('🍷 Setup Room', ROOM_ID, 'on', SERVER);

    // 1. Read Danny's selfie
    console.log('\n📸 Reading Danny\'s selfie...');
    if (!fs.existsSync(SELFIE_PATH)) {
        console.error('❌ Selfie not found at:', SELFIE_PATH);
        process.exit(1);
    }
    const dannyPhoto = toBase64(SELFIE_PATH);
    console.log('   Photo size:', Math.round(dannyPhoto.length / 1024), 'KB');

    // 2. Pre-register Danny as הרשע
    console.log('\n👤 Registering דני קריו as הרשע...');
    const regRes = await post(`${SERVER}/api/pre-register`, {
        roomId: ROOM_ID,
        name:   'דני קריו',
        photo:  dannyPhoto,
        role:   '😈 הרשע',
    });
    if (regRes.status === 200 && regRes.body.success) {
        console.log('   ✅ Registered! Room now has', regRes.body.participants?.length, 'participants.');
    } else {
        console.error('   ❌ Pre-register failed:', regRes.status, regRes.body);
        process.exit(1);
    }

    // 3. Start the seder
    console.log('\n🕯️  Starting the seder for room', ROOM_ID, '...');
    const startRes = await post(`${SERVER}/api/admin/start-seder`, {
        roomId: ROOM_ID,
        secret: ADMIN_SECRET,
    });
    if (startRes.status === 200 && startRes.body.success) {
        console.log('   ✅ Seder started!', startRes.body.participants, 'participants in room.');
    } else {
        console.error('   ❌ Start-seder failed:', startRes.status, startRes.body);
        process.exit(1);
    }

    console.log('\n🎉 Done! Everyone can now open:');
    console.log(`   ${SERVER}/?room=${ROOM_ID}`);
    console.log('   and browse the Haggadah.');
}

main().catch(err => { console.error(err); process.exit(1); });
