// Leonardo Phoenix AI image generation pipeline
// Model: Leonardo Phoenix (6b645e3a-d64f-4341-a6d8-7a3690fbf042)

const LEONARDO_API_URL = 'https://cloud.leonardo.ai/api/rest/v1';
const LEONARDO_API_KEY = process.env.LEONARDO_API_KEY || '93c8d56b-eb47-423c-9823-3844614c6123';
const PHOENIX_MODEL_ID = '6b645e3a-d64f-4341-a6d8-7a3690fbf042';

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
            const res = await fetch(`${LEONARDO_API_URL}/generations/${generationId}`, {
                headers: { Authorization: `Bearer ${LEONARDO_API_KEY}` }
            });
            const data = await res.json();
            const gen = data.generations_by_pk;
            if (gen?.status === 'COMPLETE' && gen.generated_images?.length > 0) {
                return gen.generated_images[0].url;
            }
            if (gen?.status === 'FAILED') return null;
        } catch (err) { console.error('Poll error:', err.message); }
    }
    return null;
}

async function generateImage(prompt) {
    const res = await fetch(`${LEONARDO_API_URL}/generations`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${LEONARDO_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            modelId: PHOENIX_MODEL_ID,
            prompt,
            num_images: 1,
            width: 896,
            height: 512, // Aspect ratio optimized
            alchemy: true,
            presetStyle: 'ILLUSTRATION'
        })
    });

    const data = await res.json();
    const generationId = data.sdGenerationJob?.generationId;
    if (!generationId) throw new Error('No generationId returned from Leonardo');
    return pollForImage(generationId);
}

async function generateAllImages(roomId, io, rooms) {
    console.log(`[AI] Full generation starting for room ${roomId}`);

    for (const section of HAGGADAH_PROMPTS) {
        if (!rooms[roomId]) break;
        try {
            console.log(`[AI] Generating ${section.id}: ${section.title}`);
            const imageUrl = await generateImage(section.prompt);
            if (imageUrl && rooms[roomId]) {
                rooms[roomId].images[section.id] = imageUrl;
                io.to(roomId).emit('image-ready', { pageIndex: section.id, imageUrl });
                console.log(`[AI] Page ${section.id} ready.`);
            }
        } catch (err) {
            console.error(`[AI] Failed ${section.id}:`, err.message);
        }
        await sleep(1000);
    }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = { generateAllImages };
