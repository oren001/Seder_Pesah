/**
 * generate-invitation.js
 * ---------------------
 * One-time script: generate a cinematic Exodus invitation image
 * featuring Yael & Danny Kriyo as the hero background for the RSVP screen.
 *
 * Usage:
 *   LEONARDO_API_KEY=<key> node generate-invitation.js
 *
 * Output:
 *   public/images/invitation-bg.jpg
 */

'use strict';
require('dotenv').config();

const fs   = require('fs');
const path = require('path');

// ── Leonardo API config (same as leonardo.js) ─────────────────────────────
const LEONARDO_V2_URL  = 'https://cloud.leonardo.ai/api/rest/v2';
const LEONARDO_API_URL = 'https://cloud.leonardo.ai/api/rest/v1';
const API_KEY          = process.env.LEONARDO_API_KEY;
const NB_PRO_MODEL     = 'gemini-image-2';

if (!API_KEY) {
    console.error('❌ Missing LEONARDO_API_KEY environment variable.');
    console.error('   Run with:  LEONARDO_API_KEY=<key> node generate-invitation.js');
    process.exit(1);
}

// ── The prompt ─────────────────────────────────────────────────────────────
const INVITATION_PROMPT = `
Cinematic wide-angle photorealistic photograph.
A dramatic Exodus scene: a warm sea of people leaving Egypt at golden hour,
ancient pyramids in the distance silhouetted against an enormous fiery sky
of orange, amber, and deep violet. Two specific real people lead the crowd —
a warm dark-haired woman with a joyful expression and a man with a kind face
and close-cropped hair — both dressed in ancient flowing robes but wearing
modern expressions of hope and joy. The crowd behind them stretches to the
horizon. Dust catching the light. Epic. Emotional. The colors are rich and
warm — burnt sienna, gold, and deep red — like a National Geographic cover.
Photorealistic, cinematic documentary photography, golden-hour backlight,
no cartoon, no CGI, no illustration.
`;

// ── Helpers ────────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function imgToBase64(filePath) {
    const ext = path.extname(filePath).slice(1).toLowerCase();
    const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
    const data = fs.readFileSync(filePath);
    return `data:${mime};base64,${data.toString('base64')}`;
}

async function uploadInitImage(base64Data) {
    console.log('  📤 Getting presigned upload URL...');
    const ext = base64Data.startsWith('data:image/png') ? 'png' : 'jpg';
    const res = await fetch(`${LEONARDO_API_URL}/init-image`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ extension: ext }),
    });
    const data = await res.json();
    if (!data.uploadInitImage) throw new Error(`Upload presign failed: ${JSON.stringify(data)}`);

    const { id, url, fields } = data.uploadInitImage;
    const formData = JSON.parse(fields);

    console.log(`  📤 Uploading to S3 (id=${id})...`);
    const buffer = Buffer.from(base64Data.split(',')[1], 'base64');
    const { FormData, Blob } = await import('formdata-node');
    const s3Form = new FormData();
    Object.entries(formData).forEach(([k, v]) => s3Form.set(k, v));
    s3Form.set('file', new Blob([buffer], { type: 'image/jpeg' }), 'image.jpg');

    const s3Res = await fetch(url, { method: 'POST', body: s3Form });
    if (s3Res.status !== 204 && s3Res.status !== 200) {
        throw new Error(`S3 upload failed: ${s3Res.status}`);
    }
    console.log(`  ✅ Uploaded: ${id}`);
    return id;
}

async function generateImage(prompt, initImageIds) {
    const body = {
        model: NB_PRO_MODEL,
        parameters: {
            prompt,
            quantity: 1,
            width: 1024,
            height: 768,
            prompt_enhance: 'OFF',
        },
        public: false,
    };

    if (initImageIds && initImageIds.length > 0) {
        body.parameters.guidances = {
            image_reference: initImageIds.map(id => ({
                image: { id, type: 'UPLOADED' },
                strength: 'HIGH',
            })),
        };
    }

    console.log('  🎨 Requesting generation from Leonardo...');
    const res = await fetch(`${LEONARDO_V2_URL}/generations`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${API_KEY}`,
            'Content-Type': 'application/json',
            accept: 'application/json',
        },
        body: JSON.stringify(body),
    });
    const data = await res.json();
    if (res.status !== 200) throw new Error(`Generation request failed: ${res.status} ${JSON.stringify(data)}`);
    const genId = data.generate?.generationId || data.sdGenerationJob?.generationId;
    if (!genId) throw new Error(`No generationId: ${JSON.stringify(data)}`);
    console.log(`  ⏳ Generation started: ${genId}`);
    return genId;
}

async function pollForImage(genId) {
    for (let i = 0; i < 50; i++) {
        await sleep(3000);
        const dots = '.'.repeat((i % 3) + 1);
        process.stdout.write(`\r  🌊 Waiting${dots}   `);
        try {
            const res = await fetch(`${LEONARDO_API_URL}/generations/${genId}`, {
                headers: { Authorization: `Bearer ${API_KEY}` },
            });
            const data = await res.json();
            const gen = data.generations_by_pk;
            if (gen?.status === 'COMPLETE' && gen.generated_images?.length > 0) {
                console.log('\n  ✅ Image ready!');
                return gen.generated_images[0].url;
            }
            if (gen?.status === 'FAILED') throw new Error('Generation failed');
        } catch (err) {
            if (err.message === 'Generation failed') throw err;
        }
    }
    throw new Error('Timeout waiting for image');
}

async function downloadImage(url, destPath) {
    console.log(`  💾 Downloading to ${destPath}...`);
    const res = await fetch(url);
    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(destPath, buffer);
    console.log(`  ✅ Saved: ${destPath} (${Math.round(buffer.length / 1024)} KB)`);
}

// ── Main ────────────────────────────────────────────────────────────────────
(async () => {
    console.log('\n🌊 Generating Exodus invitation image for Yael & Danny Kriyo...\n');

    const yaelPath  = path.join(__dirname, 'public/images/yael.jpg');
    const dannyPath = path.join(__dirname, 'public/images/danny.jpg');
    const outPath   = path.join(__dirname, 'public/images/invitation-bg.jpg');

    // 1. Upload reference photos
    console.log('Step 1: Uploading Yael\'s photo...');
    const yaelBase64  = imgToBase64(yaelPath);
    const yaelId      = await uploadInitImage(yaelBase64);

    console.log('Step 2: Uploading Danny\'s photo...');
    const dannyBase64 = imgToBase64(dannyPath);
    const dannyId     = await uploadInitImage(dannyBase64);

    // 2. Generate Exodus scene
    console.log('\nStep 3: Generating Exodus scene...');
    const genId = await generateImage(INVITATION_PROMPT, [yaelId, dannyId]);

    // 3. Poll for result
    const imageUrl = await pollForImage(genId);

    // 4. Save to disk
    console.log('\nStep 4: Saving image...');
    await downloadImage(imageUrl, outPath);

    console.log('\n✨ Done! The invitation background is ready at:');
    console.log(`   public/images/invitation-bg.jpg\n`);
    console.log('Commit and push to deploy to Render.com:');
    console.log('   git add public/images/invitation-bg.jpg && git commit -m "Add AI Exodus invitation background" && git push\n');
})().catch(err => {
    console.error('\n❌ Error:', err.message);
    process.exit(1);
});
