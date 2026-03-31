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
    { id: 6, title: 'Avadim Hayinu', prompt: 'Ancient Hebrews walking away from Egyptian pyramids at dawn, exhausted but free, someone trying to document it on a scroll held exactly like a phone, a small piece of matzah wrapped in cloth peeking from behind a rock. Epic wide shot, golden sunrise, photorealistic cinematic' },
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


// ── Curated participant assignments for each Haggadah page ───────────────────
// Each entry maps a page index to:
//   participants: name substrings to match against room participants (up to 3)
//   promptPrefix: optional extra instruction prepended to the page prompt
const PAGE_ASSIGNMENTS = {
    0:  { participants: ['יעלי', 'דני', 'מורן'] },
    1:  { participants: ['אפרת', 'מיכל', 'נטע'] },
    2:  { participants: ['Ailey', 'יעל-ד', 'אלעד'] },
    3:  { participants: ['איתי', 'ערן', 'אוהד'] },
    4:  { participants: ['מורן', 'אוהד', 'יעל-ק'],
          promptPrefix: 'One person in the reference images plays Pharaoh — imperious, gold-adorned crown, commanding presence on a throne. Another plays a newly-freed slave, eyes wide with wonder and amazed freedom. The third is a delighted neighbor arriving at the open door.' },
    5:  { participants: ['דני', 'איתי', 'אלעד'],
          promptPrefix: 'The three people from the reference images play the Four Sons: one with arms crossed and clear "this is completely pointless" energy (the Wicked Son), one reading the Haggadah with excited margin notes and genuine enthusiasm (the Wise Son), one looking genuinely sweet and pleasantly confused (the Simple Son). They are seated at the seder table debating.' },
    6:  { participants: ['יעל-ק', 'מאיה', 'Ailey'] },
    7:  { participants: ['אורן', 'דרור', 'אפרת'],
          promptPrefix: 'One person from the reference images plays Moses — long staff, weathered ancient robes, calm authoritative presence. Another plays Aaron beside him. They are among the five rabbis in animated all-night discussion.' },
    8:  { participants: ['Ailey', 'ערן', 'נטע'] },
    9:  { participants: ['יעלי', 'אורן', 'מיכל'] },
    10: { participants: ['דני', 'מורן', 'אוהד'],
          promptPrefix: 'One person plays a Pharaoh reacting with increasing alarm to each plague. The others are his bewildered courtiers. Show them dealing comically with frogs, darkness, and hail while trying to maintain dignity.' },
    11: { participants: ['מאיה', 'יעל-ד', 'Ailey'],
          promptPrefix: 'One person plays the triumphant moment at the Red Sea crossing — arms raised in joy, free at last. All three are on their feet mid-Dayenu song.' },
    12: { participants: ['אפרת', 'נטע', 'איתי'] },
    13: { participants: ['דרור', 'אלעד', 'ערן'],
          promptPrefix: 'One person plays Aaron the High Priest — priestly garments, officiating the ritual handwashing with ceremonial dignity.' },
    14: { participants: ['יעלי', 'מיכל', 'יעל-ק'] },
    15: { participants: ['אורן', 'דני', 'מורן'] },
    16: { participants: ['יעלי', 'אורן', 'אפרת'] },
    17: { participants: ['נטע', 'Ailey', 'אלעד'] },
    18: { participants: ['מיכל', 'יעל-ד', 'דרור'] },
    19: { participants: ['איתי', 'ערן', 'אוהד'] },
    20: { participants: ['יעלי', 'מורן', 'מאיה'] },
    21: { participants: ['מיכל', 'אורן', 'יעלי'],
          promptPrefix: 'One person plays the role of Elijah the Prophet — appearing mysteriously as the door cracks open, the gleaming wine cup before her. The others stare at the cup with complete conviction that the wine level just moved.' },
    22: { participants: ['אפרת', 'דני', 'יעל-ק'] },
    23: { participants: ['מאיה', 'נטע', 'Ailey'] },
    24: { participants: ['יעל-ד', 'מיכל', 'אלעד'],
          promptPrefix: 'One person plays the free woman — joyful, liberated, singing with total abandon in three different keys at once.' },
    25: { participants: ['ערן', 'דרור', 'אוהד'] },
    26: { participants: ['אפרת', 'יעלי', 'מורן'],
          promptPrefix: 'One person plays Miriam the Prophetess — tambourine in hand, leading the women in joyful song and dance at the Jerusalem window, robes flowing.' },
    27: { participants: ['נטע', 'דני', 'Ailey'],
          promptPrefix: 'One person is in the field of redemption — playful, noticing the small goat on the edge of the table before anyone else does, trying not to laugh.' },
    28: { participants: ['איתי', 'אלעד', 'ערן'] },
    29: { participants: ['אורן', 'מאיה', 'יעל-ק'] },
    30: { participants: ['אוהד', 'דרור', 'יעל-ד'] },
    31: { participants: ['יעלי', 'מיכל', 'נטע'] },
    32: { participants: ['אורן', 'אפרת', 'דני'] },
};

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
        throw new Error('No generationId returned from Leonardo: ' + JSON.stringify(data));
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

async function generatePersonalizedPage(roomId, pageIndex, io, rooms, options = {}) {
    if (!rooms[roomId]) return;
    try {
        console.log(`[AI] Personalized Page Generation for room ${roomId}, page ${pageIndex}`);
        io.to(roomId).emit('ai-status', { message: 'מכינים את ההזמנות ליציאת מצרים... 🌊', pageIndex });

        // 1. Upload participant selfies
        const initImageIds = [];
        let selected = [];

        if (options.selfies && options.selfies.length > 0) {
            // מי יודע override: use provided selfies (up to 3 for API limit)
            const selfieUrls = options.selfies.slice(0, 3).filter(Boolean);
            io.to(roomId).emit('ai-status', { message: `מכניסים ${selfieUrls.length} משתתפים לתמונה... ✨`, pageIndex });
            for (const photoUrl of selfieUrls) {
                const id = await uploadInitImage(photoUrl);
                if (id) initImageIds.push(id);
            }
        } else {
            // Use PAGE_ASSIGNMENTS if available for this page, else fall back to active readers / random
            const assignment = PAGE_ASSIGNMENTS[pageIndex];
            const allWithPhotos = rooms[roomId].participants.filter(p => isRealPhoto(p.photo));

            if (assignment && assignment.participants && allWithPhotos.length > 0) {
                // Pick participants by name pattern match, in assignment order
                for (const pattern of assignment.participants) {
                    const match = allWithPhotos.find(p =>
                        p.name && p.name.toLowerCase().includes(pattern.toLowerCase()) &&
                        !selected.includes(p)
                    );
                    if (match) selected.push(match);
                    if (selected.length >= 3) break;
                }
                // If we didn't find enough assigned participants, fill from available pool
                if (selected.length < 2) {
                    const remaining = allWithPhotos.filter(p => !selected.includes(p));
                    selected.push(...pickRandom(remaining, 3 - selected.length));
                }
            } else {
                // Default: prioritize active readers
                const readers = rooms[roomId].participants.filter(p => p.isReading && p.online && isRealPhoto(p.photo));
                const pool = readers.length > 0 ? readers : allWithPhotos;
                selected = pickRandom(pool, 3);
            }

            if (selected.length === 0) {
                io.to(roomId).emit('ai-status', { message: 'אין משתתפים עם תמונה — מייצר סצנה כללית... 📜', pageIndex });
            } else {
                const names = selected.map(p => p.name || 'משתתף').join(', ');
                io.to(roomId).emit('ai-status', { message: `מזמין את ${names} לסצנה... ✈️`, pageIndex });
                for (const p of selected) {
                    const id = await uploadInitImage(p.photo);
                    if (id) initImageIds.push(id);
                    else console.error('[AI] Failed to upload a participant photo');
                }
            }
        }

        // 2. Setup Prompt
        let finalPrompt;
        if (options.prompt) {
            finalPrompt = options.prompt;
        } else {
            const section = HAGGADAH_PROMPTS[pageIndex];
            if (!section) throw new Error('Invalid page index');
            const assignment = PAGE_ASSIGNMENTS[pageIndex];
            finalPrompt = assignment && assignment.promptPrefix
                ? assignment.promptPrefix + '. ' + section.prompt
                : section.prompt;
        }
        if (initImageIds.length > 0) {
            finalPrompt += `. Include the people from the reference images realistically in the scene — they look like themselves but in period-appropriate clothing, with genuine amused expressions, as if they accidentally ended up at the Exodus. One subtle modern detail on each of them (a watch, earrings, reading glasses)`;
        }
        // Global style suffix — photorealistic, cinematic, with wit
        finalPrompt += '. Hidden somewhere in the scene is a small piece of matzah wrapped in a white cloth (the afikoman) — partially concealed behind an object, under a cushion, or tucked in a corner — a fun find-the-afikoman easter egg. Cinematic photorealistic photography, rich warm saturated colors, golden hour light. Real people with genuine emotions. Humor comes from subtle anachronistic modern details hidden in ancient scenes. NOT cartoon, NOT Pixar, NOT illustration — real photography feel, like a BBC documentary that has a sense of humor';

        io.to(roomId).emit('ai-status', { message: 'שולח את הפקודה לפרעה... 📜', pageIndex });

        // 3. Generate Image
        const imageUrl = await generateImage(finalPrompt, initImageIds, (statusMsg) => {
            io.to(roomId).emit('ai-status', { message: statusMsg, pageIndex });
        });

        if (imageUrl && rooms[roomId]) {
            if (!rooms[roomId].images) rooms[roomId].images = {}; // ensure images map exists
            const featuredPhotos = options.selfies
                ? options.selfies.filter(Boolean)
                : selected.map(p => p.photo).filter(Boolean);
            rooms[roomId].images[pageIndex] = { url: imageUrl, featuredPhotos };
            io.to(roomId).emit('image-ready', { pageIndex, imageUrl, featuredPhotos });
            console.log(`[AI] Page ${pageIndex} ready for room ${roomId} (featuring ${featuredPhotos.length} participants)`);
            // Persist to Firebase immediately — survives all restarts/redeploys
            if (options.saveToFirebase) options.saveToFirebase(roomId, pageIndex, { url: imageUrl });
        } else {
            throw new Error('לא התקבלה תמונה מ-Leonardo');
        }
    } catch (err) {
        console.error(`[AI] Generation failed:`, err.message);
        io.to(roomId).emit('ai-error', { message: err.message, pageIndex });
    }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── 8 invitation image style options ────────────────────────────────────────
const INVITATION_STYLES = [
    {
        id: 1,
        label: '🌅 שקיעה אפית — ים סוף',
        description: 'שניהם מובילים המון עצום לשקיעת שמש זהובה, ים מפוצל ברקע',
        prompt: `Epic cinematic wide shot: a real woman with long dark hair (Yael) and a real man with kind face and close-cropped hair (Danny) stand at the edge of the parted Red Sea, arms outstretched, leading a vast crowd of freed Israelites toward a blazing golden sunset. Walls of deep blue water tower on either side. The sky is on fire — orange, amber, crimson. Ancient robes on their bodies but joy and relief on their modern faces. Dust and golden light. Like a Hollywood historical epic. Photorealistic cinematic photography, ultra-detailed, no cartoon.`
    },
    {
        id: 2,
        label: '🌌 לילה כוכבים במדבר',
        description: 'הלילה הראשון של חירות — שניים תחת שמי מדבר זרועי כוכבים',
        prompt: `Photorealistic night-sky photography. A real woman with long dark hair (Yael) and a real man with kind face and close-cropped hair (Danny) sit by a small desert campfire, looking up at an overwhelming Milky Way blazing across the sky. Ancient desert setting. The firelight is warm orange on their faces, the sky is deep indigo and silver. Freed Israelites resting around them in the background. The first night of freedom. Intimate, magical, awe-inspiring. National Geographic astrophotography quality, photorealistic, no cartoon.`
    },
    {
        id: 3,
        label: '🎉 חגיגת חירות — צבעונית ושמחה',
        description: 'חגיגה! ריקודים, פנסים, צבעים עזים — כמו פסטיבל עם נשמה עתיקה',
        prompt: `Joyful celebration scene: a real woman with long dark hair (Yael) and a real man with kind face and close-cropped hair (Danny) are laughing and dancing with dozens of freed people. Colorful fabric banners, lanterns glowing warm gold and crimson, dust catching the light. Vibrant saturated colors — deep red, saffron yellow, turquoise, purple. Ancient setting but pure festival energy. Confetti of flower petals. Rich, warm, cinematic. Photorealistic, vivid colors, no cartoon.`
    },
    {
        id: 4,
        label: '🏜️ מדבר מלכותי — זהב ואדום',
        description: 'שניהם עומדים גאים על רכס חול, פירמידות ברחוק, שמים דרמטיים',
        prompt: `Majestic desert portrait: a real woman with long dark hair (Yael) and a real man with kind face and close-cropped hair (Danny) stand on top of a golden sand dune, looking into the vast desert ahead. Egyptian pyramids are visible in the far distance against a dramatic stormy-golden sky of burnt sienna and deep violet clouds. They wear flowing ancient robes. Wind in their hair. The scale of freedom and wilderness. Epic, regal, emotional. Photorealistic editorial photography, warm golden tones, no cartoon.`
    },
    {
        id: 5,
        label: '🕯️ ליל הסדר — שולחן ומשפחה',
        description: 'שולחן סדר עתיק ומרהיב, הם יושבים בראשו, אורות נרות, חמים ואינטימי',
        prompt: `Intimate candlelit Passover seder scene: a real woman with long dark hair (Yael) and a real man with kind face and close-cropped hair (Danny) sit at the head of a long ancient seder table surrounded by family. The table is laden with seder plate, matzah, wine cups, beautiful food. Warm golden candlelight, deep shadows, rich warm tones of mahogany and gold. Ancient stone walls. The feeling of family, memory, and belonging. Like a Rembrandt painting brought to life. Photorealistic fine-art photography, warm tones, no cartoon.`
    },
    {
        id: 6,
        label: '🌊 רגע הנס — ים נבקע',
        description: 'הרגע הדרמטי: הים נבקע לפניהם, מים כחולים ענקיים, אור פסח אלוהי',
        prompt: `The miracle moment: a real woman with long dark hair (Yael) and a real man with kind face and close-cropped hair (Danny) stand in awe as the sea splits before them. Towering walls of deep blue-green water curve upward to the sky, sunlight refracting through them creating rainbows. Their faces show wonder and tears of joy. The dry seabed path ahead is golden sand. An entire crowd watches from behind. Breathtaking, mythic scale. Photorealistic visual effects photography, rich blues and golds, cinematic, no cartoon.`
    },
    {
        id: 7,
        label: '🎨 פוסטר אמנות — סגנון וינטאג׳ צבעוני',
        description: 'סגנון פוסטר ישראלי רטרו שנות ה-60 — צבעים עזים, גרפיקה מדהימה',
        prompt: `Vintage Israeli 1960s travel poster art style, but photorealistic. Bold graphic composition: a real woman with long dark hair (Yael) and a real man with kind face and close-cropped hair (Danny) walk forward confidently, the parting Red Sea visible behind them styled as bold flat color shapes of cobalt blue and turquoise. The sky above is divided into bands of coral, gold, and deep teal. Stars and Hebrew lettering subtly in the sky. Rich, graphic, colorful. Like a Bauhaus-influenced retro poster come to life. Photorealistic yet graphic, vibrant colors, cinematic.`
    },
    {
        id: 8,
        label: '🌸 ארץ מובטחת — בוקר של תקווה',
        description: 'הגעה לארץ המובטחת — ירוק, אור בוקר, פרחים, תקווה ושמחה',
        prompt: `The promised land arrival: a real woman with long dark hair (Yael) and a real man with kind face and close-cropped hair (Danny) step into a lush beautiful landscape at sunrise — wildflowers in bloom, rolling green hills, ancient olive trees, morning mist. They look back at a desert fading behind them and forward to paradise. Their faces show wonder and deep happiness. Golden morning light. Rich saturated greens, pinks, and golds. Like a National Geographic photograph of the most beautiful morning in history. Photorealistic fine art photography, hopeful and warm, no cartoon.`
    }
];

/**
 * generateInvitationOptions
 * -------------------------
 * Generates all 8 invitation image styles one by one.
 * Calls onProgress(id, status) after each one finishes.
 */
async function generateInvitationOptions(yaelBase64, dannyBase64, onProgress = null) {
    const log = (id, msg) => {
        console.log(`[InvOption ${id}]`, msg);
        if (onProgress) onProgress(id, msg);
    };

    log(0, 'Uploading reference photos...');
    const yaelId  = await uploadInitImage(yaelBase64);
    const dannyId = await uploadInitImage(dannyBase64);
    if (!yaelId || !dannyId) throw new Error('Failed to upload host photos');

    const results = [];
    for (const style of INVITATION_STYLES) {
        log(style.id, `Generating: ${style.label}...`);
        try {
            const url = await generateImage(style.prompt, [yaelId, dannyId], msg => log(style.id, msg));
            results.push({ id: style.id, url, label: style.label, description: style.description });
            log(style.id, `Done: ${url}`);
        } catch (err) {
            log(style.id, `Failed: ${err.message}`);
            results.push({ id: style.id, url: null, error: err.message, label: style.label, description: style.description });
        }
        // Small pause between generations to be nice to the API
        await sleep(1000);
    }
    return results;
}

/**
 * generateInvitationImage
 * -----------------------
 * One-time generation: creates a cinematic Exodus scene featuring
 * Yael & Danny using their photos as character references.
 * Returns the public image URL (does NOT save to disk — caller should do that).
 *
 * @param {string} yaelBase64  - data:image/jpeg;base64,... for Yael's photo
 * @param {string} dannyBase64 - data:image/jpeg;base64,... for Danny's photo
 * @param {function} onStatus  - optional status callback
 * @returns {Promise<string>} image URL
 */
async function generateInvitationImage(yaelBase64, dannyBase64, onStatus = null) {
    const log = msg => { console.log('[InvitationImage]', msg); if (onStatus) onStatus(msg); };

    log('Uploading Yael\'s photo...');
    const yaelId = await uploadInitImage(yaelBase64);
    if (!yaelId) throw new Error('Failed to upload Yael\'s photo');

    log('Uploading Danny\'s photo...');
    const dannyId = await uploadInitImage(dannyBase64);
    if (!dannyId) throw new Error('Failed to upload Danny\'s photo');

    const prompt = `Cinematic wide-angle photorealistic photograph. A dramatic Exodus scene: ` +
        `a warm sea of people leaving Egypt at golden hour, ancient pyramids silhouetted against ` +
        `an enormous fiery sky of orange, amber, and deep violet. Two specific real people lead ` +
        `the crowd — a warm dark-haired woman with a radiant joyful smile (Yael) and a man with ` +
        `a kind face and close-cropped hair (Danny) — both dressed in ancient flowing robes but ` +
        `with modern expressions of joy and hope. The crowd behind them stretches to the horizon. ` +
        `Dust catching the golden backlight. Epic, emotional, cinematic. Rich warm colors: ` +
        `burnt sienna, gold, deep red. Dramatic sky. Like a National Geographic cover. ` +
        `Photorealistic documentary photography, NOT cartoon, NOT CGI, NOT illustration.`;

    log('Generating Exodus scene...');
    const imageUrl = await generateImage(prompt, [yaelId, dannyId], log);
    log('Done!');
    return imageUrl;
}

// ── Exodus Character Card ──────────────────────────────────────────────────
// Generates a once-per-user personalized movie-poster image using the
// participant's selfie as a character reference.
async function generateExodusCard(photoBase64, name) {
    const safeN = (name || 'חברי').replace(/"/g, "'");
    const initId = await uploadInitImage(photoBase64);
    if (!initId) throw new Error('Failed to upload selfie');

    const prompt =
        `Epic Hollywood biblical movie poster, photorealistic cinematic photography. ` +
        `The EXACT person from the reference photo is the undisputed star of the Exodus — ` +
        `their face preserved perfectly, front and centre. ` +
        `They wear ancient Hebrew robes, one arm raised dramatically ` +
        `toward a parting Red Sea, the other gripping a gnarled wooden staff. ` +
        `Expression: determined, inspired, and just slightly bewildered — ` +
        `like they suddenly remembered they left the oven on back in Egypt. ` +
        `Background: golden desert sunrise, colossal walls of turquoise water ` +
        `curling 60 metres high on both sides, thousands of freed Hebrew slaves ` +
        `streaming through the dry seabed behind them, dust catching the backlight. ` +
        `At the bottom of the image, large bold golden movie-poster lettering reads: ` +
        `"${safeN} — יוצא ממצרים". ` +
        `Style: cinematic photorealistic, rich warm saturated desert colours, ` +
        `epic dramatic lighting, Oscar-winning biblical epic feel. ` +
        `NOT cartoon, NOT illustration, NOT Pixar, NOT CGI. Looks like a real film set photo.`;

    return await generateImage(prompt, [initId]);
}

module.exports = { HAGGADAH_PROMPTS, PAGE_ASSIGNMENTS, INVITATION_STYLES, generateImage,
    generatePersonalizedPage, generateInvitationImage, generateInvitationOptions,
    uploadInitImage, generateExodusCard };
