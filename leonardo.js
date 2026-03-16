// Leonardo Phoenix AI image generation pipeline
// Model: Leonardo Phoenix (6b645e3a-d64f-4341-a6d8-7a3690fbf042)

const LEONARDO_API_URL = 'https://cloud.leonardo.ai/api/rest/v1'; // Keep v1 for init-image and polling
const LEONARDO_V2_URL = 'https://cloud.leonardo.ai/api/rest/v2';
const LEONARDO_API_KEY = process.env.LEONARDO_API_KEY || null;
const NB_PRO_MODEL = 'gemini-image-2';

// Fun, colorful, modern & hilarious prompts for Haggadah sections
// Style: vibrant pop-art, Pixar-style 3D, witty & playful — NOT dry/religious
const HAGGADAH_PROMPTS = [
    { id: 0, title: 'Kadesh', prompt: 'A giant overflowing wine glass at a wild festive dinner party, neon purple and gold splashes, confetti everywhere, Pixar 3D style, vibrant colors, funny cheerful mood, cartoon characters toasting' },
    { id: 1, title: 'Urchatz', prompt: 'Hilarious scene of people enthusiastically washing hands with a comically oversized golden faucet, soap bubbles flying everywhere like a foam party, bright pop-art colors, playful cartoon style' },
    { id: 2, title: 'Karpas', prompt: 'A tiny piece of parsley doing a cannonball dive into a giant bowl of salt water, huge splash, onlookers cheering, vibrant neon colors, funny Pixar 3D cartoon style' },
    { id: 3, title: 'Yachatz', prompt: 'A giant matzah cracker being karate-chopped in half by a funny character, crumbs flying everywhere in slow motion, dramatic action movie lighting, bright colorful pop-art style, humorous' },
    { id: 4, title: 'Ha Lachma Anya', prompt: 'A wide-open colorful door to a wild party, neon signs saying WELCOME in multiple languages, a red carpet leading to a funky disco-lit dinner table, Pixar 3D style, warm and inviting, funny characters waving' },
    { id: 5, title: 'Ma Nishtana', prompt: 'An adorable wide-eyed kid standing on a chair at a dinner table pointing at everything confused, giant question marks floating around in neon colors, family laughing, Pixar 3D style, bright and hilarious' },
    { id: 6, title: 'Avadim Hayinu', prompt: 'Cartoon characters breaking free from colorful chains and dancing, confetti explosion, pyramids in the background with disco lights, epic freedom celebration, vibrant pop-art, Pixar style, funny and triumphant' },
    { id: 7, title: 'Story of Rabbis', prompt: 'Five nerdy professors having an all-night study marathon with mountains of coffee cups and books, one fell asleep in a pizza box, sunrise through window, vibrant colorful cartoon style, hilarious academic chaos' },
    { id: 8, title: 'Four Sons', prompt: 'Four hilarious cartoon characters: a bookworm genius with huge glasses, a rebellious punk rocker, a sweet confused teddy bear, and a silent cool character with sunglasses, bright pop-art style, funny personality portraits' },
    { id: 9, title: 'Vehi Sheamda', prompt: 'A family group photo but through the ages — from ancient to modern — all making the same silly pose, colorful timeline mashup, vibrant neon accents, warm and funny, Pixar 3D style' },
    { id: 10, title: 'Ten Plagues', prompt: 'A hilarious comic-book grid of ten silly plagues: rubber frogs raining, ketchup river, cartoon locusts wearing sunglasses, total darkness with glowing eyes, bright pop-art colors, funny and over-the-top' },
    { id: 11, title: 'Dayenu', prompt: 'An epic victory dance party on a split ocean floor with disco balls, confetti, and fireworks, cartoon characters high-fiving, neon colors reflecting off water walls, Pixar 3D, pure joy and celebration' },
    { id: 12, title: 'Rabban Gamliel', prompt: 'A giant colorful seder plate like a carnival wheel with oversized matzah, a cute cartoon lamb, and hilarious bitter herbs making funny faces, bright pop-art, Pixar style, food with personality' },
    { id: 13, title: 'In Every Generation', prompt: 'A person taking a selfie and in the phone screen they appear as an ancient Egyptian escapee running through a colorful portal, split reality, vibrant neon, Pixar 3D style, funny time-travel vibe' },
    { id: 14, title: 'Hallel Part 1', prompt: 'A massive colorful karaoke night with cartoon characters singing passionately into microphones, musical notes and stars flying everywhere, neon stage lights, Pixar 3D style, pure fun energy' },
    { id: 15, title: 'Rachtzah', prompt: 'A comedic hand-washing competition with judges holding up score cards, dramatic water splashes in slow motion, rainbow colored soap, bright cartoon style, hilarious and over-dramatic' },
    { id: 16, title: 'Motzi Matzah', prompt: 'A tower of giant matzah crackers being balanced by a funny character, crumbs falling like snow, bright golden lighting, other characters watching in amazement, vibrant Pixar 3D cartoon style' },
    { id: 17, title: 'Maror', prompt: 'A hilarious face-reaction compilation of cartoon characters tasting super spicy horseradish, eyes watering comically, steam coming out of ears, bright pop-art colors, funny and exaggerated expressions' },
    { id: 18, title: 'Korech', prompt: 'A giant ridiculous sandwich being assembled like a cooking show challenge, matzah, herbs and charoset flying through the air, a chef character juggling ingredients, bright colorful Pixar 3D style' },
    { id: 19, title: 'Shulchan Orech', prompt: 'The most epic colorful feast ever with a ridiculously long table stretching to the horizon, mountains of delicious food, happy cartoon characters eating and laughing, warm festive lighting, Pixar 3D style' },
    { id: 20, title: 'Tzafun', prompt: 'Kids on a hilarious treasure hunt for hidden matzah, one kid looking under a couch cushion finding it glowing like gold, others searching everywhere comically, bright neon colors, Pixar 3D adventure style' },
    { id: 21, title: 'Barech', prompt: 'A magical golden wine cup floating and glowing, happy cartoon characters around a table raising tiny cups in a cheerful toast, sparkles and stars everywhere, warm vibrant colors, Pixar 3D celebration' },
    { id: 22, title: 'Hallel & Nirtzah', prompt: 'An epic grand finale party scene — fireworks, confetti, golden Jerusalem skyline in the background, cartoon characters dancing and celebrating, a mysterious cool figure arriving through a glowing door, vibrant neon Pixar 3D style' },
    { id: 23, title: 'Hallel A', prompt: 'A massive outdoor rock concert with cartoon characters playing instruments on a rainbow stage, colorful sound waves visible in the air, crowd cheering, neon lights, Pixar 3D festival vibe' },
    { id: 24, title: 'Hallel B', prompt: 'A hilarious choir of mismatched cartoon characters singing with exaggerated expressions, some off-key with musical notes flying crooked, colorful spotlights, confetti, Pixar 3D karaoke party style' },
    { id: 25, title: 'Hallel C', prompt: 'An epic dance battle between cartoon characters in a disco arena, breakdancing moves, spinning disco balls reflecting rainbow colors, crowd going wild, vibrant neon Pixar 3D style' },
    { id: 26, title: 'Nirtzah A', prompt: 'A magical portal opening to a futuristic colorful Jerusalem, cartoon characters stepping through excitedly, holographic buildings, flying cars, utopian celebration, vibrant Pixar 3D sci-fi meets tradition' },
    { id: 27, title: 'Nirtzah B', prompt: 'An adorable cartoon goat being chased through a hilarious Rube Goldberg machine, colorful chain reactions, objects flying, pure cartoon chaos and fun, bright pop-art Pixar 3D style' },
    { id: 28, title: 'Nirtzah C', prompt: 'A hilarious counting game scene: cartoon characters counting from one to thirteen with increasingly ridiculous items, visual number chaos, bright colors, funny mathematical madness, Pixar 3D style' },
    { id: 29, title: 'Nirtzah D', prompt: 'A colorful cosmic scene with cartoon characters floating among stars and galaxies, building a playful universe, planets made of matzah and wine, whimsical space adventure, vibrant Pixar 3D style' },
    { id: 30, title: 'Nirtzah E', prompt: 'An epic cartoon race scene with characters riding comically oversized animals through a colorful obstacle course, finish line made of matzah, crowd cheering with confetti, Pixar 3D style' },
    { id: 31, title: 'Nirtzah F', prompt: 'A magical treehouse party at night, cartoon characters celebrating on every level, fairy lights everywhere, stars twinkling, a golden cup glowing at the top, warm and magical, vibrant Pixar 3D style' },
    { id: 32, title: 'Nirtzah G', prompt: 'The ultimate season finale — cartoon characters on a rooftop watching a spectacular fireworks show spelling out NEXT YEAR, golden Jerusalem skyline, champagne toasts, vibrant celebration, Pixar 3D grand finale' }
];


async function generateImage(prompt, initImageIds = null, onStatus = null) {
    if (!LEONARDO_API_KEY) throw new Error('LEONARDO_API_KEY environment variable is not set');
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
                strength: "HIGH"
            }))
        };
    }

    if (onStatus) onStatus('שולח בקשה למודל (V2)...');

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

    // V2 Response structure: data.generate.generationId
    const generationId = data.generate?.generationId || data.sdGenerationJob?.generationId;

    if (!generationId) {
        console.error('[Leonardo Error] Unexpected Response Structure:', JSON.stringify(data));
        throw new Error('No generationId returned from Leonardo');
    }

    if (onStatus) onStatus('הייצור החל, ממתין לתמונה...');
    return pollForImage(generationId, onStatus);
}

async function pollForImage(generationId, onStatus = null) {
    const MAX_ATTEMPTS = 40;
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
        await sleep(3000);
        if (onStatus) onStatus(`בודק סטטוס... (${i + 1}/${MAX_ATTEMPTS})`);
        try {
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
                throw new Error('Leonardo fails to generate image');
            }
        } catch (err) { console.error('Poll error:', err.message); }
    }
    throw new Error('Timeout: הייצור לקח יותר מדי זמן');
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

        console.log(`[AI] Assigned ID: ${id}. Uploading to S3 (${url})...`);

        // Convert base64 to buffer
        const buffer = Buffer.from(base64Data.split(',')[1], 'base64');
        console.log(`[AI] Image buffer size: ${buffer.length} bytes`);

        // 2. Upload to S3 using native FormData
        const s3Form = new FormData();

        // S3 CRITICAL: Fields from 'fields' must come BEFORE the 'file' field
        Object.entries(formData).forEach(([key, value]) => {
            s3Form.append(key, value);
        });

        // S3 CRITICAL: The 'file' field MUST be last
        // We use a Blob to ensure binary integrity with native fetch
        const blob = new Blob([buffer], { type: 'image/jpeg' });
        s3Form.append('file', blob, 'image.jpg');

        const s3Res = await fetch(url, {
            method: 'POST',
            body: s3Form
        });

        if (s3Res.status !== 204 && s3Res.status !== 200) {
            const errorText = await s3Res.text();
            console.error('[AI] S3 Upload failed:', s3Res.status, errorText);
            return null;
        }

        console.log(`[AI] Character Reference uploaded successfully: ${id}`);
        return id;
    } catch (err) {
        console.error('[AI] Upload failed:', err.message, err.stack);
        return null;
    }
}

// Helper: check if a photo string is a real image (not emoji/icon)
function isRealPhoto(photo) {
    return photo && (photo.startsWith('data:') || photo.startsWith('http') || photo.startsWith('blob:'));
}

// Pick up to N random items from an array
function pickRandom(arr, n) {
    const shuffled = [...arr].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(n, shuffled.length));
}

async function generatePersonalizedPage(roomId, pageIndex, io, rooms) {
    if (!rooms[roomId]) return;
    try {
        console.log(`[AI] Personalized Page Generation for room ${roomId}, page ${pageIndex}`);
        io.to(roomId).emit('ai-status', { message: 'מתחיל תהליך עיבוד (NB PRO)...', pageIndex });

        // 1. Upload participant selfies — prioritize active readers
        const initImageIds = [];
        const readers = rooms[roomId].participants.filter(p => p.isReading && p.online && isRealPhoto(p.photo));
        const allWithPhotos = rooms[roomId].participants.filter(p => isRealPhoto(p.photo));
        // Use readers if any, otherwise fallback to all participants
        const pool = readers.length > 0 ? readers : allWithPhotos;
        const selected = pickRandom(pool, 3); // API limit: max 3 reference images

        if (selected.length === 0) {
            io.to(roomId).emit('ai-status', { message: 'אין סלפי משתתפים, מייצר תמונה כללית...', pageIndex });
        } else {
            const src = readers.length > 0 ? 'קוראים פעילים' : 'משתתפים';
            io.to(roomId).emit('ai-status', {
                message: `מעלה ${selected.length} תמונות של ${src} ל-Leonardo...`,
                pageIndex
            });
            for (const p of selected) {
                const id = await uploadInitImage(p.photo);
                if (id) {
                    initImageIds.push(id);
                } else {
                    console.error('[AI] Failed to upload a participant photo');
                }
            }
        }

        // 2. Setup Prompt
        const section = HAGGADAH_PROMPTS[pageIndex];
        if (!section) throw new Error('Invalid page index');

        let finalPrompt = section.prompt;
        if (initImageIds.length > 0) {
            finalPrompt += `. The people in the reference images should appear as fun cartoon characters in the scene, with exaggerated happy expressions and silly poses. Make it hilarious, warm and memorable`;
        }
        // Global style suffix — ensure every image is fun and modern
        finalPrompt += '. Ultra vibrant saturated colors, high energy, witty visual humor, modern pop-art meets Pixar 3D rendering, NOT religious or serious';

        io.to(roomId).emit('ai-status', { message: 'אוסף נתונים ושולח פקודת ייצור...', pageIndex });

        // 3. Generate Image
        const imageUrl = await generateImage(finalPrompt, initImageIds, (statusMsg) => {
            io.to(roomId).emit('ai-status', { message: statusMsg, pageIndex });
        });

        if (imageUrl && rooms[roomId]) {
            if (!rooms[roomId].images) rooms[roomId].images = {}; // ensure images map exists
            const featuredPhotos = selected.map(p => p.photo).filter(Boolean);
            rooms[roomId].images[pageIndex] = { url: imageUrl, featuredPhotos };
            io.to(roomId).emit('image-ready', { pageIndex, imageUrl, featuredPhotos });
            console.log(`[AI] Page ${pageIndex} ready for room ${roomId} (featuring ${featuredPhotos.length} participants)`);
            // Status overlay will be cleared by app.js on image-ready
        } else {
            throw new Error('לא התקבלה תמונה מ-Leonardo');
        }
    } catch (err) {
        console.error(`[AI] Generation failed:`, err.message);
        io.to(roomId).emit('ai-error', { message: err.message, pageIndex });
    }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = { HAGGADAH_PROMPTS, generateImage, generatePersonalizedPage };
