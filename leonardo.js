// Leonardo Phoenix AI image generation pipeline
// Model: Leonardo Phoenix (6b645e3a-d64f-4341-a6d8-7a3690fbf042)

const LEONARDO_API_URL = 'https://cloud.leonardo.ai/api/rest/v1'; // Keep v1 for init-image and polling
const LEONARDO_V2_URL = 'https://cloud.leonardo.ai/api/rest/v2';
const LEONARDO_API_KEY = process.env.LEONARDO_API_KEY || null;
const NB_PRO_MODEL = 'gemini-image-2';

// Photorealistic "Exodus happened yesterday" style prompts
// Style: cinematic documentary photography, rich warm colors, subtle anachronistic humor
// People feel like they were actually there — at the Exodus, but yesterday
const HAGGADAH_PROMPTS = [
    { id: 0, title: 'Kadesh', prompt: 'Real people at a Passover seder table raising ornate silver wine cups in warm candlelight, one person\'s phone buzzing face-down and they are pointedly ignoring it, ancient Egyptian decor mixed with a modern wine bottle peeking in the corner, rich jewel tones, cinematic photorealistic documentary photography' },
    { id: 1, title: 'Urchatz', prompt: 'Ritual handwashing from an ancient stone pitcher in golden light, one person has a modern smartwatch visible on their wrist and is secretly timing themselves, others waiting patiently with barely-suppressed smiles, terracotta walls, photorealistic editorial photography' },
    { id: 2, title: 'Karpas', prompt: 'A single sprig of fresh parsley being solemnly dipped into a small bowl of salt water, the entire family leaning in watching this mundane act with absurd reverence, one child looks deeply skeptical, warm candlelight, ancient seder table, photorealistic close-up documentary' },
    { id: 3, title: 'Yachatz', prompt: 'A matzah being broken precisely in half, the whole family leaning in watching as if witnessing surgery, one half being wrapped in a napkin with the secrecy of a heist, everyone pretending not to notice where it goes, dramatic warm candlelight, photorealistic' },
    { id: 4, title: 'Ha Lachma Anya', prompt: 'A warm ancient doorway thrown open to the street at night, inviting golden light pouring out, family gesturing welcomingly, matzah visible on the table behind them, an actual neighbor showing up with their coat on looking delighted and slightly confused, photorealistic cinematic' },
    { id: 5, title: 'Ma Nishtana', prompt: 'A child standing on their chair at the ancient seder table, gesturing at the seder plate with the confidence of a prosecutor presenting evidence, four questions clearly serious business, the entire family watching with genuine delight and barely-controlled smiles, candlelight, photorealistic documentary' },
    { id: 6, title: 'Avadim Hayinu', prompt: 'Ancient Hebrews walking away from Egyptian pyramids at dawn, exhausted but free, one person in the group has clearly modern sneakers visible under their robe, someone trying to document it on a scroll held exactly like a phone. Epic wide shot, golden sunrise, photorealistic cinematic' },
    { id: 7, title: 'Story of Rabbis', prompt: 'Five wise rabbis in robes having an intensely animated all-night discussion, table covered in ancient scrolls and at least six empty espresso-sized cups, one asleep face-down in his notes, sunrise just beginning through the window, warm lamp light, photorealistic bookish chaos' },
    { id: 8, title: 'Four Sons', prompt: 'Four distinctly different people at one seder table: one reading the Haggadah with reading glasses and margin notes, one with arms crossed and clear teenager energy, one looking genuinely sweet and confused, one somehow wearing sunglasses indoors at night, candlelight, photorealistic candid portrait' },
    { id: 9, title: 'Vehi Sheamda', prompt: 'A sweeping multigenerational family portrait, same pose same expression across four generations, ancient decor around them, youngest in modern pajamas oldest in ancient robes, warm rich golden lighting, photorealistic, deeply moving and slightly absurd' },
    { id: 10, title: 'Ten Plagues', prompt: 'Photo essay of ten images: actual frogs everywhere but people calmly eating around them, a river mysteriously red while someone photographs it for social media, hail while someone checks a weather app, total darkness with only phone screen glow visible, dry editorial photojournalism humor' },
    { id: 11, title: 'Dayenu', prompt: 'An entire Passover family on their feet mid-song, arms around each other, wine cups raised, total unbridled joy, someone conducting an invisible orchestra, the family dog has clearly joined in howling, warm golden candlelight, photorealistic candid celebration' },
    { id: 12, title: 'Rabban Gamliel', prompt: 'An elegantly lit seder plate photographed as if it were a Michelin-star restaurant dish, matzah, maror and shankbone beautifully arranged, a hand pointing to each element with the authority of a sommelier, warm directional light, photorealistic food editorial photography' },
    { id: 13, title: 'In Every Generation', prompt: 'A modern person taking a selfie in front of ancient Egyptian pyramids, but in the phone screen their reflection shows them dressed in ancient Exodus clothing, slight knowing smile, golden hour light, subtle magical realism, photorealistic cinematic, the joke is just in the reflection' },
    { id: 14, title: 'Hallel Part 1', prompt: 'Spontaneous Passover singing around the seder table, people of all ages genuinely joining in, one person using a wine glass as a microphone with full commitment, everyone knows every word, the dog howling from the corner, warm golden candlelight, photorealistic candid photography' },
    { id: 15, title: 'Rachtzah', prompt: 'Elegant ritual handwashing with an ornate ancient silver pitcher, beautiful ceremony, one person is secretly timing themselves on their phone to get the exact right amount of time, others watching with warmth, stone basin, photorealistic editorial photography' },
    { id: 16, title: 'Motzi Matzah', prompt: 'Two hands blessing two pieces of matzah aloft in golden candlelight, crumbs already on the tablecloth somehow, someone in the background quietly photographing the moment for the family album, warm ceremonial atmosphere, photorealistic, beautiful composition' },
    { id: 17, title: 'Maror', prompt: 'A lineup of family members tasting horseradish in sequence: first person cautious, second surprised, third with eyes watering, fourth completely stoic but clearly lying, fifth already reaching for water, photorealistic candid portrait series, warm light, deeply relatable human moment' },
    { id: 18, title: 'Korech', prompt: 'An enormous Hillel sandwich being assembled with engineering precision, matzah, maror and charoset stacked impossibly high, one person already took a bite before the blessing and is looking slightly guilty but satisfied, warm light, photorealistic food photography, joyful chaos' },
    { id: 19, title: 'Shulchan Orech', prompt: 'The Passover feast at full chaos, epic long table with every dish competing for space, multiple conversations happening simultaneously, a small child asleep under the table, grandmother refilling everyone\'s plate without asking, warm golden overhead light, photorealistic National Geographic quality' },
    { id: 20, title: 'Tzafun', prompt: 'Kids in full heist mode searching every cushion and chair for the hidden afikoman, one has clearly found it and is negotiating ransom terms with grandfather with complete dead-serious expressions, warm evening light, photorealistic documentary low-angle shot, a movie in one frame' },
    { id: 21, title: 'Barech', prompt: 'Elijah\'s cup gleaming in candlelight, the front door cracked open for him, everyone at the table staring at the cup waiting for it to move, one person thinks it absolutely did move, the wine level is suspiciously slightly lower, photorealistic, warm mysterious atmosphere' },
    { id: 22, title: 'Hallel & Nirtzah', prompt: 'Grand finale of the seder, everyone singing together, chairs pushed back, someone standing on theirs, ancient Jerusalem skyline glowing warmly through the window, the night ending in uncontainable family joy, warm candlelight meets blue night sky, photorealistic cinematic wide shot' },
    { id: 23, title: 'Hallel A', prompt: 'Intense passionate Passover singing, some people eyes closed really feeling every word, others watching them with affection, the room vibrating with shared memory and song, candlelight flickering, photorealistic candid emotional portrait photography' },
    { id: 24, title: 'Hallel B', prompt: 'Enthusiastic group seder song happening in at least three different keys simultaneously, everyone utterly confident they are correct, the harmonies happening by accident and somehow working, candlelight, warm glow, photorealistic candid' },
    { id: 25, title: 'Hallel C', prompt: 'Spontaneous dancing in the living room after the seder, ancient song on clearly modern speakers visible in the corner, grandmother dancing with toddler, everyone somehow knows the same moves, pure intergenerational joy, warm light, photorealistic candid celebration' },
    { id: 26, title: 'Nirtzah A', prompt: 'Family gathered at a window looking out at a glowing Jerusalem skyline at night, some in ancient robes some in modern clothes, all united in the same hopeful gaze, one cup still raised, cinematic photorealistic, warm amber interior light vs cool blue outside' },
    { id: 27, title: 'Nirtzah B', prompt: 'A very small goat somehow on the edge of the seder table while the family is absorbed in the final songs, one cat watching the goat with absolute focus from across the room, nobody has noticed yet, perfect timing, photorealistic candid, warm candlelight, one perfect absurd moment' },
    { id: 28, title: 'Nirtzah C', prompt: 'Family counting thirteen things on their fingers, running out of fingers and moving to toes, one person pulled out a notepad, another is inexplicably using an ancient abacus, all counting with total seriousness, warm light, photorealistic, hilariously intense group focus' },
    { id: 29, title: 'Nirtzah D', prompt: 'Small group sitting outside under an extraordinary desert night sky, the Milky Way blazing above them, they look tiny and genuinely awestruck, someone pointing upward, warm campfire glow on faces, photorealistic astrophotography meets intimate human moment' },
    { id: 30, title: 'Nirtzah E', prompt: 'Ancient Israelites crossing the desert but with very modern energy: mismatched effort levels, one sitting down already, one sprinting with full commitment, donkeys watching with visible judgment, photorealistic action shot, golden desert light, one epic absurd scene' },
    { id: 31, title: 'Nirtzah F', prompt: 'Magical outdoor gathering after the seder ends, fairy lights in ancient olive trees, children chasing fireflies, elders talking quietly under the stars, warm dusk light, stone walls, the most perfect evening, photorealistic golden-blue hour photography' },
    { id: 32, title: 'Nirtzah G', prompt: 'The very end of the seder: sleepy satisfied faces around the table, wine glasses empty, dishes half-cleared, one person asleep upright in their chair, another just smiling into the distance, golden sunrise light just beginning through the window, photorealistic candid, complete and happy' }
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

const FUNNY_STATUSES = [
    'פרעה מנסה לעכב... אבל ה-AI כבר יצא ממצרים 🌊',
    'ממתין לאישור מסיני... 📡',
    'בצלאל ממשיך לצייר — בלי עוד 40 שנה 🎨',
    'ה-AI לא ממהר. גם יציאת מצרים לקחה זמן 📜',
    'שולח פקס לסיני... 📠 (כן, עדיין)',
    'ממתין לאישור ממשה... 🌿',
    'המן ניתן, התמונה מגיעה 🌾',
    'הים לא נבקע בניסיון הראשון גם 🌊',
    'עוד קצת... הייצור יוצא לחירות 🕊️',
    'מפרעה לא קיבלנו תשובה. שולח עוד מכה 🐸',
    'AI על קצת בצלים, לפחות לא על פרך 💪',
    'מעבד... טכנולוגיה לעם ישראל ⚡',
    'כמעט שם — יותר מהיר מ-40 שנה במדבר 🏕️',
    'המחשב נושם עמוק ויוצר 🖼️',
    'מחכה לניצוץ יצירתי... 🌟',
];

async function pollForImage(generationId, onStatus = null) {
    const MAX_ATTEMPTS = 40;
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
        await sleep(3000);
        if (onStatus) onStatus(FUNNY_STATUSES[i % FUNNY_STATUSES.length]);
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
        io.to(roomId).emit('ai-status', { message: 'מכינים את ההזמנות ליציאת מצרים... 🌊', pageIndex });

        // 1. Upload participant selfies — prioritize active readers
        const initImageIds = [];
        const readers = rooms[roomId].participants.filter(p => p.isReading && p.online && isRealPhoto(p.photo));
        const allWithPhotos = rooms[roomId].participants.filter(p => isRealPhoto(p.photo));
        // Use readers if any, otherwise fallback to all participants
        const pool = readers.length > 0 ? readers : allWithPhotos;
        const selected = pickRandom(pool, 3); // API limit: max 3 reference images

        if (selected.length === 0) {
            io.to(roomId).emit('ai-status', { message: 'אין משתתפים עם תמונה — מייצר סצנה כללית... 📜', pageIndex });
        } else {
            const names = selected.map(p => p.name || 'משתתף').join(', ');
            io.to(roomId).emit('ai-status', {
                message: `מזמין את ${names} לסצנה... ✈️`,
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
            finalPrompt += `. Include the people from the reference images realistically in the scene — they look like themselves but in period-appropriate clothing, with genuine amused expressions, as if they accidentally ended up at the Exodus. One subtle modern detail on each of them (a watch, sneakers, an earring)`;
        }
        // Global style suffix — photorealistic, cinematic, with wit
        finalPrompt += '. Cinematic photorealistic photography, rich warm saturated colors, golden hour light. Real people with genuine emotions. Humor comes from subtle anachronistic modern details hidden in ancient scenes. NOT cartoon, NOT Pixar, NOT illustration — real photography feel, like a BBC documentary that has a sense of humor';

        io.to(roomId).emit('ai-status', { message: 'שולח את הפקודה לפרעה... 📜', pageIndex });

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
