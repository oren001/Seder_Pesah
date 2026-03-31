// Downloads all generated Haggadah images from the local server and saves them
// as static files in public/images/haggadah/ so they survive Render restarts.
//
// Usage:
//   1. Make sure local server is running: node server.js
//   2. Run: node download_images.js
//   3. git add public/images/haggadah && git commit && git push
//
// After deployment, Render will auto-load these static images on startup.

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const LOCAL_TARGET = 'http://localhost:3050';
const ROOM_ID = '5drrkj';
const OUTPUT_DIR = path.join(__dirname, 'public', 'images', 'haggadah');

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        const h = url.startsWith('https') ? https : http;
        h.get(url, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
        }).on('error', reject);
    });
}

function downloadImageToFile(imageUrl, destPath) {
    return new Promise((resolve, reject) => {
        const h = imageUrl.startsWith('https') ? https : http;
        const file = fs.createWriteStream(destPath);
        h.get(imageUrl, (res) => {
            if (res.statusCode !== 200) {
                file.close();
                fs.unlink(destPath, () => {});
                return reject(new Error(`HTTP ${res.statusCode} for ${imageUrl}`));
            }
            res.pipe(file);
            file.on('finish', () => { file.close(); resolve(); });
        }).on('error', (err) => {
            file.close();
            fs.unlink(destPath, () => {});
            reject(err);
        });
    });
}

async function main() {
    console.log('=== DOWNLOADING HAGGADAH IMAGES TO STATIC FILES ===\n');

    // 1. Fetch image list from local server
    let exportData;
    try {
        exportData = await fetchJson(`${LOCAL_TARGET}/api/admin/export-images?roomId=${ROOM_ID}&secret=pesach2026`);
    } catch (e) {
        console.error('❌ Cannot contact local server. Is it running? (node server.js)');
        console.error('   Error:', e.message);
        process.exit(1);
    }

    const images = exportData.images || {};
    const count = Object.keys(images).length;
    if (count === 0) {
        console.log('⚠️  No images found on local server. Generate them first with run_local_generation.js');
        process.exit(1);
    }
    console.log(`Found ${count} images to download.\n`);

    // 2. Create output directory
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
        console.log(`Created: ${OUTPUT_DIR}`);
    }

    // 3. Download each image
    let success = 0, failed = 0;
    for (const [pageIndex, imgData] of Object.entries(images)) {
        const imageUrl = typeof imgData === 'string' ? imgData : imgData.url;
        if (!imageUrl) { console.log(`  ⚠️  Page ${pageIndex}: no URL, skipping`); failed++; continue; }

        const fileName = `page-${pageIndex}.jpg`;
        const destPath = path.join(OUTPUT_DIR, fileName);

        process.stdout.write(`  Downloading page ${String(pageIndex).padStart(2)} → ${fileName} ... `);
        try {
            await downloadImageToFile(imageUrl, destPath);
            const size = Math.round(fs.statSync(destPath).size / 1024);
            console.log(`✅ (${size} KB)`);
            success++;
        } catch (e) {
            console.log(`❌ ${e.message}`);
            failed++;
        }
    }

    console.log(`\n📊 Done: ${success} downloaded, ${failed} failed.`);

    if (success > 0) {
        console.log(`\n✅ Images saved to: ${OUTPUT_DIR}`);
        console.log('\n📌 Next steps:');
        console.log('   git add repo/public/images/haggadah');
        console.log('   git commit -m "Add static haggadah AI images"');
        console.log('   git push');
        console.log('\n   Render will redeploy and images will be available at:');
        console.log('   /images/haggadah/page-0.jpg  through  /images/haggadah/page-32.jpg');
    }
}

main().catch(console.error);
