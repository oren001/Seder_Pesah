// Leonardo Phoenix AI image generation pipeline
// Model: Leonardo Phoenix (6b645e3a-d64f-4341-a6d8-7a3690fbf042)

const LEONARDO_API_URL = 'https://cloud.leonardo.ai/api/rest/v1'; // Keep v1 for init-image and polling
const LEONARDO_V2_URL = 'https://cloud.leonardo.ai/api/rest/v2';
const LEONARDO_API_KEY = process.env.LEONARDO_API_KEY || '03028d8e-afc4-46f6-b967-069fc4fc01a1';
const NB_PRO_MODEL = 'gemini-image-2';

// Rich prompts for ALL 23 Chabad Haggadah sections
const HAGGADAH_PROMPTS = [
    { id: 0, title: 'Kadesh', prompt: 'A golden Kiddush cup with red wine on an ancient Passover table, candles flickering, detailed oil painting' },
    { id: 1, title: 'Urchatz', prompt: 'Ritual hand washing with a silver pitcher and stone basin, soft warm lighting, ancient biblical style' },
    { id: 2, title: 'Karpas', prompt: 'Green parsley being dipped in a bowl of salt water on a seder plate, ancient wooden table' },
    { id: 3, title: 'Yachatz', prompt: 'Breaking a round handmade matzah into two pieces, white linen background, symbolic ceremony' },
    { id: 4, title: 'Ha Lachma Anya', prompt: 'An ancient tent door open to the starry desert night, welcoming light from inside, freedom theme' },
    { id: 5, title: 'Ma Nishtana', prompt: 'A young child asking the four questions at a festive candlelit table, family gathered' },
    { id: 6, title: 'Avadim Hayinu', prompt: 'Israelite slaves building pyramids in Egypt, dramatic sunset, epic biblical illustration' },
    { id: 7, title: 'Story of Rabbis', prompt: 'Five ancient rabbis sitting together in Bnei Brak, studying by candlelight all night, deep discussion' },
    { id: 8, title: 'Four Sons', prompt: 'Four distinct characters representing the wise, wicked, simple, and silent sons, traditional symbolic style' },
    { id: 9, title: 'Vehi Sheamda', prompt: 'A glowing protective light over a Jewish family throughout history, survival and hope, spiritual theme' },
    { id: 10, title: 'Ten Plagues', prompt: 'Symbolic icons of the ten plagues: blood, frogs, locusts, darkness, dramatic split composition' },
    { id: 11, title: 'Dayenu', prompt: 'Israelites crossing the split Red Sea, joy and gratitude, dramatic miracle scene, sunrise' },
    { id: 12, title: 'Rabban Gamliel', prompt: 'The three symbols: the Pesach lamb, Matzah, and Maror on a beautiful seder plate' },
    { id: 13, title: 'In Every Generation', prompt: 'A person today looking in a mirror and seeing themselves as an ancient Israelite leaving Egypt' },
    { id: 14, title: 'Hallel Part 1', prompt: 'Singing songs of praise, hands raised in joy, ancient temple atmosphere, spiritual light' },
    { id: 15, title: 'Rachtzah', prompt: 'Second ritual hand washing before the meal, focus on the blessing and water' },
    { id: 16, title: 'Motzi Matzah', prompt: 'Holding three stacked matzahs, blessing the bread from the earth, tradition' },
    { id: 17, title: 'Maror', prompt: 'Bitter herbs being eaten, a moment of reflection on the bitterness of slavery' },
    { id: 18, title: 'Korech', prompt: 'A Hillel sandwich being made: matzah, maror, and charoset together' },
    { id: 19, title: 'Shulchan Orech', prompt: 'A beautiful festive meal spread out, family eating together in joy' },
    { id: 20, title: 'Tzafun', prompt: 'Children searching for the hidden Afikoman matzah in a warm home setting' },
    { id: 21, title: 'Barech', prompt: 'Grace after meals, a small golden cup of wine, gratitude and prayer' },
    { id: 22, title: 'Hallel & Nirtzah', prompt: 'The prophet Elijah entering through an open door, golden Jerusalem in the distance, hope' }
];

async function pollForImage(generationId) {
    const MAX_ATTEMPTS = 30;
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
        await sleep(3000);
        try {
            // Polling is still typically v1 or common across versions
            const res = await fetch(`${LEONARDO_API_URL}/generations/${generationId}`, {
                headers: { Authorization: `Bearer ${LEONARDO_API_KEY}` }
            });
            const data = await res.json();
            const gen = data.generations_by_pk;
            if (gen?.status === 'COMPLETE' && gen.generated_images?.length > 0) {
                return gen.generated_images[0].url;
            }
            if (gen?.status === 'FAILED') {
                console.error('[AI] Generation failed:', JSON.stringify(data));
                return null;
            }
        } catch (err) { console.error('Poll error:', err.message); }
    }
    return null;
}

async function generateImage(prompt, initImageIds = null) {
    const body = {
        model: NB_PRO_MODEL,
        parameters: {
            prompt,
            quantity: 1,
            width: 1024,
            height: 1024,
            prompt_enhance: "OFF"
        },
        public: false
    };

    if (initImageIds && initImageIds.length > 0) {
        body.parameters.guidances = {
            image_reference: initImageIds.map(id => ({
                image: {
                    id: id,
                    type: "UPLOADED"
                },
                strength: "MID"
            }))
        };
    }

    const res = await fetch(`${LEONARDO_V2_URL}/generations`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${LEONARDO_API_KEY}`,
            'Content-Type': 'application/json',
            accept: 'application/json'
        },
        body: JSON.stringify(body)
    });

    const data = await res.json();
    if (res.status !== 200) {
        console.error('[Leonardo Error] Status:', res.status, 'Response:', JSON.stringify(data));
        throw new Error(`Leonardo API error: ${res.status}`);
    }

    const generationId = data.sdGenerationJob?.generationId;
    if (!generationId) {
        console.error('[Leonardo Error] Full Data:', JSON.stringify(data));
        throw new Error('No generationId returned from Leonardo');
    }
    return pollForImage(generationId);
}

async function uploadInitImage(base64Data) {
    try {
        console.log('[AI] Starting Character Reference upload...');

        // 1. Get presigned URL
        const res = await fetch(`${LEONARDO_API_URL}/init-image`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${LEONARDO_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ extension: 'jpg' })
        });
        const data = await res.json();

        if (!data.uploadInitImage) {
            console.error('[AI] Init-image failed:', JSON.stringify(data));
            return null;
        }

        const { id, url, fields } = data.uploadInitImage;
        const formData = JSON.parse(fields);

        console.log(`[AI] Assigned ID: ${id}. Uploading to S3...`);

        // 2. Upload to S3
        const FormData = require('form-data');
        const s3Form = new FormData();

        // S3 CRITICAL: Fields from 'fields' must come BEFORE the 'file' field
        Object.entries(formData).forEach(([key, value]) => {
            s3Form.append(key, value);
        });

        // Convert base64 to buffer
        const buffer = Buffer.from(base64Data.split(',')[1], 'base64');

        // S3 CRITICAL: The 'file' field MUST be last
        s3Form.append('file', buffer, {
            filename: 'selfie.jpg',
            contentType: 'image/jpeg'
        });

        const s3Res = await fetch(url, {
            method: 'POST',
            body: s3Form,
            headers: s3Form.getHeaders()
        });

        if (s3Res.status !== 204) {
            const errorText = await s3Res.text();
            console.error('[AI] S3 Upload failed:', s3Res.status, errorText);
            return null;
        }

        console.log(`[AI] Character Reference uploaded successfully: ${id}`);
        return id;
    } catch (err) {
        console.error('[AI] Upload failed:', err.message);
        return null;
    }
}

async function generateAllImages(roomId, io, rooms) {
    // This is now disabled to save credits. Individual pages or Nano Test should be used.
    console.log(`[AI] generateAllImages called for ${roomId} - DISABLED to save credits.`);
}

async function generateNanoTest(roomId, io, rooms) {
    if (!rooms[roomId]) return;
    try {
        console.log(`[AI] NANO TEST PRO for room ${roomId}`);

        // 1. Upload all valid participant photos
        const initImageIds = [];
        for (const p of rooms[roomId].participants) {
            if (p.photo) {
                const id = await uploadInitImage(p.photo);
                if (id) initImageIds.push(id);
            }
        }

        if (initImageIds.length === 0) throw new Error('No participant photos found');

        const kadeshSection = HAGGADAH_PROMPTS[0];
        const imageUrl = await generateImage(kadeshSection.prompt, initImageIds);

        if (imageUrl && rooms[roomId]) {
            rooms[roomId].images[0] = imageUrl;
            io.to(roomId).emit('image-ready', { pageIndex: 0, imageUrl });
            console.log(`[AI] NANO TEST PRO Page 0 ready with ${initImageIds.length} characters.`);
        }
    } catch (err) {
        console.error(`[AI] NANO TEST failed:`, err.message);
    }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = { HAGGADAH_PROMPTS, generateImage, generateAllImages, generateNanoTest };
