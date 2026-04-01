require('dotenv').config();   // loads .env for local dev (no-op in production)
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const { generatePersonalizedPage, generateInvitationImage, generateInvitationOptions, INVITATION_STYLES, generateExodusCard, HAGGADAH_PROMPTS } = require('./leonardo');
const { OAuth2Client } = require('google-auth-library');

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '256326772055-e29p61798pa9npj533mb08i05en55956.apps.googleusercontent.com';
const client = new OAuth2Client(CLIENT_ID);

// Co-leader registry — loaded from LEADER_EMAILS env var (set in Render dashboard)
// Format: "email1:DisplayName1,email2:DisplayName2"
// Fallback keeps the app working locally without env vars set
function buildLeaders() {
    const raw = process.env.LEADER_EMAILS || '';
    const obj = {};
    if (raw.trim()) {
        raw.split(',').forEach(entry => {
            const [email, ...nameParts] = entry.trim().split(':');
            if (email) obj[email.toLowerCase()] = nameParts.join(':') || 'מנחה';
        });
    }
    return obj;
}
const LEADERS = buildLeaders();
console.log(`[Leaders] Loaded ${Object.keys(LEADERS).length} leader(s) from env`);

function isAllowedLeader(email) {
    return !!(email && LEADERS[email.toLowerCase()]);
}
function leaderDisplayName(email) {
    return (email && LEADERS[email.toLowerCase()]) || 'מנחה';
}

// TEST_MODE: only active outside production — never on Render
const TEST_MODE = (process.env.TEST_MODE === '1' || process.env.TEST_MODE === 'true')
    && process.env.NODE_ENV !== 'production';
if (TEST_MODE) console.log('[TEST_MODE] ⚠️  Local dev only — auth disabled');

const app = express();

// CORS — allow any origin (needed for two-app architecture)
const cors = require('cors');
app.use(cors());

// Required by Google Identity Services to allow the popup to communicate with the main window
app.use((req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    next();
});

// Server config endpoint — intentionally empty to avoid leaking internals
app.get('/api/config', (req, res) => {
    res.json({});
});

// ── Test seed endpoint — creates a room pre-populated with fake participants ──
app.post('/api/test/seed-room', express.json(), (req, res) => {
    const { count = 30 } = req.body || {};
    const NAMES = ['אורן','יעלי','דני','מירי','יוסי','תמר','אבי','נועה','גיל','רונית',
        'שי','לירון','עמית','הילה','בני','שירה','אלון','דפנה','עידו','ורד',
        'ניר','מיכל','רן','עינת','אסף','רחל','גבי','ליאת','טל','אריה'];

    // Generate a tiny colored-circle selfie as base64
    function fakePhoto(hue) {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><circle cx="40" cy="40" r="40" fill="hsl(${hue},70%,55%)"/><text x="40" y="52" font-size="32" text-anchor="middle" fill="white">${String.fromCodePoint(0x1F600 + Math.floor(hue/15) % 80)}</text></svg>`;
        return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
    }

    const targetRoomId = req.body.roomId;
    let roomId;

    if (targetRoomId && rooms[targetRoomId]) {
        // Add fake users to existing room
        roomId = targetRoomId;
        const existing = rooms[roomId];
        const startIdx = existing.participants.length;
        for (let i = 0; i < count; i++) {
            existing.participants.push({
                id: `fake-${startIdx + i}`,
                name: NAMES[(startIdx + i) % NAMES.length] + ((startIdx + i) >= NAMES.length ? ` ${Math.floor((startIdx + i) / NAMES.length) + 1}` : ''),
                photo: fakePhoto((startIdx + i) * 12),
                online: true,
                isGuest: true,
                socketId: `fake-${startIdx + i}`
            });
        }
        io.to(roomId).emit('room-updated', { participants: existing.participants });
    } else {
        // Create new seeded room
        roomId = 'TEST-' + Math.random().toString(36).slice(2, 8).toUpperCase();
        const participants = Array.from({ length: count }, (_, i) => ({
            id: `fake-${i}`,
            name: NAMES[i % NAMES.length] + (i >= NAMES.length ? ` ${Math.floor(i / NAMES.length) + 1}` : ''),
            photo: fakePhoto(i * 12),
            online: i < 4,
            isGuest: true,
            socketId: `fake-${i}`
        }));
        rooms[roomId] = {
            id: roomId,
            participants,
            currentPage: 5,
            leaderId: 'fake-0',
            leaderName: participants[0].name,
            leaderPin: '1111',
            tasks: [],
            sederStarted: true,
            reactions: { 5: { 'fake-0': '🙏', 'fake-1': '🎉', 'fake-2': '🙏' } },
            miYodea: {},
            images: {},
            createdAt: new Date().toISOString()
        };
    }

    console.log(`[TEST] Seeded room ${roomId} with ${count} fake participants`);
    res.json({ roomId, participantCount: rooms[roomId].participants.length, leaderName: rooms[roomId].leaderName });
});

// ── Test: inject a fake image into a live room and broadcast to all clients ─
app.post('/api/test/inject-image', express.json(), (req, res) => {
    const { roomId, pageIndex, imageUrl } = req.body;
    if (!rooms[roomId]) return res.status(404).json({ error: 'room not found' });
    if (!rooms[roomId].images) rooms[roomId].images = {};
    rooms[roomId].images[pageIndex] = { url: imageUrl, featuredPhotos: [] };
    io.to(roomId).emit('image-ready', { pageIndex, imageUrl, featuredPhotos: [] });
    res.json({ ok: true });
});

// ── Invitation image generation endpoint ─────────────────────────────────
// GET /api/generate-invitation
// Called by the host admin panel to generate (or regenerate) the hero image.
// Reads Yael & Danny's photos from public/images/, generates via Leonardo,
// saves result to public/images/invitation-bg.jpg
let _invGenInProgress = false;
let _optionsGenInProgress = false;
// Track generation status for each option: { id, status, ready, url }
const _optionStatus = {};

// ── Generate all 8 options ────────────────────────────────────────────────
app.get('/api/generate-invitation-options', async (req, res) => {
    if (_optionsGenInProgress) {
        return res.json({ status: 'running', options: Object.values(_optionStatus) });
    }

    const yaelPath  = path.join(__dirname, 'public', 'images', 'yael.jpg');
    const dannyPath = path.join(__dirname, 'public', 'images', 'danny.jpg');

    if (!fs.existsSync(yaelPath) || !fs.existsSync(dannyPath)) {
        return res.status(400).json({ error: 'Host photos not found' });
    }

    // Initialize status for all 8
    INVITATION_STYLES.forEach(s => {
        _optionStatus[s.id] = { id: s.id, label: s.label, description: s.description, status: 'waiting', ready: false, url: null };
    });

    res.json({ status: 'started', message: 'Generating 8 options — check /api/invitation-options-status for progress' });

    _optionsGenInProgress = true;
    try {
        const toBase64 = (p) => {
            const data = fs.readFileSync(p);
            return `data:image/jpeg;base64,${data.toString('base64')}`;
        };
        const results = await generateInvitationOptions(
            toBase64(yaelPath),
            toBase64(dannyPath),
            (id, msg) => {
                if (_optionStatus[id]) {
                    _optionStatus[id].status = msg;
                    console.log(`[Options] [${id}] ${msg}`);
                }
            }
        );

        // Save each result to disk
        const fetchFn = require('node-fetch');
        for (const r of results) {
            if (r.url) {
                try {
                    const imgRes = await fetchFn(r.url);
                    const buffer = Buffer.from(await imgRes.arrayBuffer());
                    const outPath = path.join(__dirname, 'public', 'images', `invitation-option-${r.id}.jpg`);
                    fs.writeFileSync(outPath, buffer);
                    _optionStatus[r.id].ready = true;
                    _optionStatus[r.id].url   = `/images/invitation-option-${r.id}.jpg`;
                    _optionStatus[r.id].status = 'ready';
                    console.log(`[Options] Saved option ${r.id}`);
                } catch (e) {
                    _optionStatus[r.id].status = 'error: ' + e.message;
                }
            } else {
                _optionStatus[r.id].status = 'failed: ' + (r.error || 'unknown');
            }
        }
    } catch (err) {
        console.error('[Options] Generation failed:', err.message);
    } finally {
        _optionsGenInProgress = false;
    }
});

// ── Status check for the options ──────────────────────────────────────────
app.get('/api/invitation-options-status', (req, res) => {
    res.json({
        inProgress: _optionsGenInProgress,
        options: Object.values(_optionStatus)
    });
});

// ── Pick one of the options as the live invitation background ─────────────
app.post('/api/set-invitation-bg', express.json(), (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'id required' });
    const src  = path.join(__dirname, 'public', 'images', `invitation-option-${id}.jpg`);
    const dest = path.join(__dirname, 'public', 'images', 'invitation-bg.jpg');
    if (!fs.existsSync(src)) return res.status(404).json({ error: `Option ${id} not generated yet` });
    fs.copyFileSync(src, dest);
    console.log(`[Options] Set invitation-bg to option ${id}`);
    res.json({ ok: true, message: `Option ${id} is now the active invitation background!` });
});

// ── Collect all real selfies across all rooms ──────────────────────────────
app.get('/api/all-selfies', (req, res) => {
    const seen = new Set();
    const result = [];
    Object.values(rooms).forEach(room => {
        (room.participants || []).forEach(p => {
            if (!p.photo || !p.photo.startsWith('data:image')) return;
            if (!p.name || p.name.startsWith('fake-') || p.id?.startsWith('fake-')) return;
            const fp = p.photo.substring(0, 100);
            if (seen.has(fp)) return;
            seen.add(fp);
            result.push({ name: p.name, photo: p.photo });
        });
    });
    res.json({ participants: result });
});

// ── Copy participants from any previous room into current room ─────────────
app.post('/api/copy-from-room', express.json(), (req, res) => {
    const { targetRoomId, sourceRoomId } = req.body || {};
    const target = rooms[targetRoomId];
    const source = rooms[sourceRoomId];
    if (!target) return res.status(404).json({ error: 'target room not found' });
    if (!source) return res.status(404).json({ error: 'source room not found' });

    const seen = new Set(target.participants.map(p => p.photo?.substring(0, 100)).filter(Boolean));
    let added = 0;
    (source.participants || []).forEach(p => {
        if (!p.photo || !p.photo.startsWith('data:image')) return;
        if (!p.name || p.id?.startsWith('fake-')) return;
        const fp = p.photo.substring(0, 100);
        if (seen.has(fp)) return;
        seen.add(fp);
        target.participants.push({ id: `prereg-${Date.now()}-${added}`, name: p.name, photo: p.photo, online: false, preRegistered: true });
        added++;
    });
    saveRooms();
    io.to(targetRoomId).emit('room-updated', { participants: target.participants });
    res.json({ success: true, added, participants: target.participants });
});

// ── Remove a participant from a room (host action) ─────────────────────────
app.delete('/api/room-participant', express.json(), (req, res) => {
    const { roomId, participantId } = req.body || {};
    if (!roomId || !participantId) return res.status(400).json({ error: 'roomId and participantId required' });
    const room = rooms[roomId];
    if (!room) return res.status(404).json({ error: 'room not found' });
    room.participants = room.participants.filter(p => p.id !== participantId);
    saveRooms();
    io.to(roomId).emit('room-updated', { participants: room.participants });
    res.json({ success: true, participants: room.participants });
});

// ── Pre-register participants (host uploads photos before seder) ───────────
app.post('/api/pre-register', express.json({ limit: '4mb' }), (req, res) => {
    const { roomId, name, photo, role } = req.body || {};
    if (!roomId || !name) return res.status(400).json({ error: 'roomId and name required' });
    const room = rooms[roomId];
    if (!room) return res.status(404).json({ error: 'room not found' });

    // Check if already pre-registered
    const existing = room.participants.find(p => p.preRegistered && p.name.trim().toLowerCase() === name.trim().toLowerCase());
    if (existing) {
        if (photo) existing.photo = photo;
        if (role !== undefined) existing.role = role || null;
    } else {
        room.participants.push({
            id: `prereg-${Date.now()}`,
            name: name.trim(),
            photo: photo || null,
            role: role || null,
            online: false,
            preRegistered: true
        });
    }
    saveRooms();
    res.json({ success: true, participants: room.participants });
});

// ── Admin: force-start seder for a room ──────────────────────────────────
app.post('/api/admin/start-seder', express.json(), (req, res) => {
    const { roomId, secret } = req.body || {};
    if (secret !== (process.env.ADMIN_SECRET || 'pesach2026')) {
        return res.status(403).json({ error: 'forbidden' });
    }
    const room = rooms[roomId];
    if (!room) return res.status(404).json({ error: 'room not found' });
    room.sederStarted = true;
    room.currentPage = room.currentPage || 0;
    saveRooms();
    io.to(roomId).emit('seder-started', { currentPage: room.currentPage });
    res.json({ success: true, roomId, participants: room.participants.length });
});

// POST /api/admin/generate-all-pages
// Pre-generates all Haggadah page images with curated participant assignments.
// Runs sequentially in the background — ~30s per page, ~16 min total for 33 pages.
app.post('/api/admin/generate-all-pages', express.json(), async (req, res) => {
    const { roomId, secret, pages } = req.body || {};
    if (secret !== (process.env.ADMIN_SECRET || 'pesach2026')) {
        return res.status(403).json({ error: 'forbidden' });
    }
    const room = rooms[roomId];
    if (!room) return res.status(404).json({ error: 'room not found' });

    const totalPages = HAGGADAH_PROMPTS.length; // 33
    const pageList = Array.isArray(pages)
        ? pages.filter(p => p >= 0 && p < totalPages)
        : Array.from({ length: totalPages }, (_, i) => i);

    res.json({ started: true, totalPages: pageList.length, roomId });

    // Run strictly sequential — one page at a time to avoid OOM and rate limits
    (async () => {
        console.log(`[Admin] Starting bulk generation for room ${roomId}: ${pageList.length} pages sequentially`);
        for (const pageIndex of pageList) {
            if (req.body.force !== true && room.images && room.images[pageIndex]) {
                console.log(`[Admin] Page ${pageIndex} already has image — skipping`);
                continue;
            }
            console.log(`[Admin] Generating page ${pageIndex}/${totalPages - 1}...`);
            try {
                await generatePersonalizedPage(roomId, pageIndex, io, rooms, { saveToFirebase: saveImageToFirebase });
            } catch (err) {
                console.warn(`[Admin] Page ${pageIndex} failed (${err.message}), retrying once...`);
                await sleep(5000);
                try {
                    await generatePersonalizedPage(roomId, pageIndex, io, rooms, { saveToFirebase: saveImageToFirebase });
                } catch (err2) {
                    console.error(`[Admin] Page ${pageIndex} retry also failed: ${err2.message}`);
                }
            }
            saveImageCache();
        }
        console.log(`[Admin] Bulk generation complete for room ${roomId}`);
        io.to(roomId).emit('ai-status', { message: '🎉 כל תמונות ההגדה מוכנות!', pageIndex: -1 });
    })();
});

// GET /api/admin/export-images?roomId=...&secret=...
// Returns all generated image URLs as JSON — save this output to commit to git
app.get('/api/admin/export-images', (req, res) => {
    const { roomId, secret } = req.query;
    if (secret !== (process.env.ADMIN_SECRET || 'pesach2026')) {
        return res.status(403).json({ error: 'forbidden' });
    }
    const room = rooms[roomId];
    if (!room) return res.status(404).json({ error: 'room not found' });
    const images = {};
    for (const [k, v] of Object.entries(room.images || {})) {
        images[k] = typeof v === 'string' ? v : { url: v.url };
    }
    res.json({ roomId, count: Object.keys(images).length, images });
});

// POST /api/admin/import-images
// Push a massive object of generated images into the active server instance
app.post('/api/admin/import-images', express.json({ limit: '10mb' }), (req, res) => {
    const { roomId, secret, images } = req.body || {};
    if (secret !== (process.env.ADMIN_SECRET || 'pesach2026')) {
        return res.status(403).json({ error: 'forbidden' });
    }
    const room = rooms[roomId];
    if (!room) return res.status(404).json({ error: 'room not found' });
    if (!images || typeof images !== 'object') return res.status(400).json({ error: 'invalid images object' });
    
    room.images = room.images || {};
    let imported = 0;
    for (const [pageIndex, imgData] of Object.entries(images)) {
        room.images[pageIndex] = typeof imgData === 'string' ? imgData : imgData.url;
        imported++;
        // Inform connected users of the new images
        const imgData = room.images[pageIndex];
        const imageUrl = typeof imgData === 'string' ? imgData : imgData.url;
        io.to(roomId).emit('image-ready', { pageIndex: parseInt(pageIndex), imageUrl, featuredPhotos: [] });
    }
    saveImageCache();
    console.log(`[Admin] Imported ${imported} images to room ${roomId}`);
    res.json({ success: true, imported, roomId });
});

app.delete('/api/pre-register', express.json(), (req, res) => {
    const { roomId, name } = req.body || {};
    if (!roomId || !name) return res.status(400).json({ error: 'roomId and name required' });
    const room = rooms[roomId];
    if (!room) return res.status(404).json({ error: 'room not found' });
    room.participants = room.participants.filter(p => !(p.preRegistered && p.name.trim().toLowerCase() === name.trim().toLowerCase()));
    saveRooms();
    res.json({ success: true });
});

app.get('/api/pre-register', (req, res) => {
    const { roomId } = req.query;
    if (!roomId) return res.status(400).json({ error: 'roomId required' });
    const room = rooms[roomId];
    if (!room) return res.status(404).json({ error: 'room not found' });
    res.json({ participants: room.participants });
});

// ── Exodus Character Card — one-per-person, token-protected ──────────────
const _exodusCardUsed = new Set(); // IP-based rate limit (reset on server restart)

app.get('/api/exodus-card-enabled', async (req, res) => {
    // Force disabled to prevent RSVP hangs — no longer using this flow
    return res.json({ enabled: false });
});

app.post('/api/generate-exodus-card', express.json({ limit: '2mb' }), async (req, res) => {
    if (!process.env.LEONARDO_API_KEY) {
        console.warn('[ExodusCard] LEONARDO_API_KEY not set');
        return res.status(503).json({ error: 'ai_not_configured', message: 'Leonardo API key not set' });
    }
    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
    if (_exodusCardUsed.has(ip)) {
        return res.status(429).json({ error: 'already_used', message: 'כבר יצרת את התמונה שלך 🎨' });
    }
    const { photo, name } = req.body || {};
    console.log(`[ExodusCard] Request from ${ip}, name="${name}", photo length=${photo?.length || 0}, starts with="${photo?.substring(0, 30)}"`);
    if (!photo || !photo.startsWith('data:image')) {
        console.warn(`[ExodusCard] Invalid photo — missing or wrong format`);
        return res.status(400).json({ error: 'photo required' });
    }
    _exodusCardUsed.add(ip); // lock before async work to prevent concurrent requests
    try {
        console.log(`[ExodusCard] Generating for "${name || '?'}" (${ip})...`);
        const imageUrl = await generateExodusCard(photo, name || 'חברי');
        console.log(`[ExodusCard] Done for "${name}" → ${imageUrl?.substring(0, 80)}`);
        res.json({ imageUrl });
    } catch (err) {
        _exodusCardUsed.delete(ip); // allow one retry on error
        console.error(`[ExodusCard] FAILED for "${name}" (${ip}):`, err.message, err.stack);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/generate-invitation', async (req, res) => {
    if (_invGenInProgress) {
        return res.json({ status: 'running', message: 'Generation already in progress...' });
    }

    const yaelPath  = path.join(__dirname, 'public', 'images', 'yael.jpg');
    const dannyPath = path.join(__dirname, 'public', 'images', 'danny.jpg');
    const outPath   = path.join(__dirname, 'public', 'images', 'invitation-bg.jpg');

    if (!fs.existsSync(yaelPath) || !fs.existsSync(dannyPath)) {
        return res.status(400).json({ error: 'Host photos not found in public/images/' });
    }

    // Kick off async generation — respond immediately so request doesn't timeout
    res.json({ status: 'started', message: 'Generating Exodus invitation image...' });

    _invGenInProgress = true;
    try {
        const toBase64 = (p) => {
            const data = fs.readFileSync(p);
            return `data:image/jpeg;base64,${data.toString('base64')}`;
        };
        const yaelBase64  = toBase64(yaelPath);
        const dannyBase64 = toBase64(dannyPath);

        console.log('[Server] Generating invitation background image...');
        const imageUrl = await generateInvitationImage(yaelBase64, dannyBase64,
            msg => console.log('[InvGen]', msg));

        // Download and save
        const fetchFn = require('node-fetch');
        const imgRes = await fetchFn(imageUrl);
        const buffer = Buffer.from(await imgRes.arrayBuffer());
        fs.writeFileSync(outPath, buffer);
        console.log(`[Server] Invitation image saved: ${outPath} (${Math.round(buffer.length/1024)} KB)`);
    } catch (err) {
        console.error('[Server] Invitation image generation failed:', err.message);
    } finally {
        _invGenInProgress = false;
    }
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Version state
let serverVersion = '1.0.1772';
try {
    const vPath = path.join(__dirname, 'public', 'version.json');
    if (fs.existsSync(vPath)) {
        const vData = JSON.parse(fs.readFileSync(vPath, 'utf8'));
        serverVersion = vData.version;
        console.log(`[Version] Server started with version: ${serverVersion}`);
    }
} catch (e) { console.error('Failed to load version:', e); }

app.use(express.static(path.join(__dirname, 'public')));

// In-memory room state
const rooms = {};

function generateId() {
    return Math.random().toString(36).substring(2, 8);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
const TASKS_FILE  = path.join(DATA_DIR, 'tasks.json');
const ROOMS_FILE  = path.join(DATA_DIR, 'rooms.json');
const IMAGES_FILE = path.join(DATA_DIR, 'images_cache.json'); // Separate image URL cache

// Load persisted tasks
let persistedTasks = {};
try {
    if (fs.existsSync(TASKS_FILE)) {
        persistedTasks = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8'));
    }
} catch (e) { console.error('Failed to load tasks:', e); }

// Load persisted rooms
try {
    if (fs.existsSync(ROOMS_FILE)) {
        const data = JSON.parse(fs.readFileSync(ROOMS_FILE, 'utf8'));
        // Restore rooms, but reset socket-specific state like 'online'
        for (const id in data) {
            rooms[id] = data[id];
            rooms[id].participants.forEach(p => p.online = false);
            rooms[id].leaderId = null; // Clear stale socket IDs on restart
            rooms[id].leaderName = null;
            if (!rooms[id].leaderPin) rooms[id].leaderPin = '1111'; // Patch legacy rooms
        }
        console.log(`[Persistence] Restored ${Object.keys(rooms).length} rooms.`);
    }
} catch (e) { console.error('Failed to load rooms:', e); }

function saveRooms() {
    try {
        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
        // Stringify without formatting to save memory and reduce OOM spikes
        fs.writeFileSync(ROOMS_FILE, JSON.stringify(rooms));
    } catch (e) {
        console.error('Failed to save rooms:', e.message);
    }
}

// Load image URL cache and merge into rooms (survives rooms.json resets)
try {
    if (fs.existsSync(IMAGES_FILE)) {
        const cache = JSON.parse(fs.readFileSync(IMAGES_FILE, 'utf8'));
        for (const roomId in cache) {
            if (!rooms[roomId]) continue;
            if (!rooms[roomId].images) rooms[roomId].images = {};
            for (const pageIndex in cache[roomId]) {
                if (!rooms[roomId].images[pageIndex]) {
                    rooms[roomId].images[pageIndex] = cache[roomId][pageIndex];
                }
            }
        }
        console.log('[Persistence] Restored image cache from images_cache.json');
    }
} catch (e) { console.error('Failed to load images cache:', e); }

function saveImageCache() {
    try {
        const cache = {};
        for (const roomId in rooms) {
            if (rooms[roomId].images && Object.keys(rooms[roomId].images).length > 0) {
                cache[roomId] = {};
                for (const [k, v] of Object.entries(rooms[roomId].images)) {
                    cache[roomId][k] = typeof v === 'string' ? v : { url: v.url };
                }
            }
        }
        fs.writeFileSync(IMAGES_FILE, JSON.stringify(cache, null, 2));
    } catch (e) { console.error('Failed to save images cache:', e); }
}

// ── Firebase Realtime Database image persistence ─────────────────────────────
// Image URLs are stored in Firebase RTDB — survives ALL Render restarts/redeploys.
// Free Spark plan is more than enough (just 33 short URL strings).
//
// Required env vars on Render:
//   FIREBASE_URL    — e.g. https://your-project-default-rtdb.firebaseio.com
//   FIREBASE_SECRET — Database secret (Firebase console → Project settings → Service accounts → Database secrets)
//
// Firebase REST API: GET/PUT/PATCH to <FIREBASE_URL>/haggadah_images.json?auth=<SECRET>

function firebaseUrl(path = '') {
    const base = (process.env.FIREBASE_URL || '').replace(/\/$/, '');
    const secret = process.env.FIREBASE_SECRET || '';
    return `${base}/haggadah_images${path}.json?auth=${secret}`;
}

async function loadImagesFromFirebase() {
    if (!process.env.FIREBASE_URL || !process.env.FIREBASE_SECRET) {
        console.log('[Firebase] No FIREBASE_URL/SECRET — skipping Firebase image load');
        return;
    }
    try {
        const res = await fetch(firebaseUrl());
        if (!res.ok) { console.error('[Firebase] Load failed:', res.status); return; }
        const data = await res.json();
        if (!data) { console.log('[Firebase] No images stored yet'); return; }
        // data shape: { roomId: { pageIndex: { url } } }
        for (const roomId in data) {
            if (roomId === '5drrkj') continue; // Prevent Firebase from overwriting the pristine hardcoded URLs!
            if (!rooms[roomId]) rooms[roomId] = { id: roomId, participants: [], images: {}, tasks: [], leaderId: null, leaderName: null, leaderPin: '1111', sederStarted: false, createdAt: new Date().toISOString() };
            if (!rooms[roomId].images) rooms[roomId].images = {};
            for (const pageIdx in data[roomId]) {
                rooms[roomId].images[pageIdx] = data[roomId][pageIdx];
            }
        }
        const total = Object.values(data).reduce((s, r) => s + Object.keys(r).length, 0);
        console.log(`[Firebase] Loaded ${total} image URLs`);
    } catch (e) { console.error('[Firebase] Load error:', e.message); }
}

async function saveImageToFirebase(roomId, pageIndex, imageData) {
    if (!process.env.FIREBASE_URL || !process.env.FIREBASE_SECRET) return;
    try {
        const value = typeof imageData === 'string' ? { url: imageData } : { url: imageData.url };
        const res = await fetch(firebaseUrl(`/${roomId}/${pageIndex}`), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(value)
        });
        if (res.ok) console.log(`[Firebase] Saved page ${pageIndex} for room ${roomId}`);
        else console.error('[Firebase] Save failed:', res.status, await res.text());
    } catch (e) { console.error('[Firebase] Save error:', e.message); }
}

// Load images from Firebase on startup (merges into rooms after rooms.json is loaded)
loadImagesFromFirebase().catch(() => {});

// ── Hardcoded Leonardo URLs for Room 5drrkj ────────────────────────────────
// The user has no quota and wants these images directly embedded for tonight.
(function loadHardcodedHaggadahImages() {
    const STATIC_ROOM = '5drrkj';
    if (!rooms[STATIC_ROOM]) rooms[STATIC_ROOM] = { id: STATIC_ROOM, participants: [], images: {}, tasks: [], leaderId: null, leaderName: null, leaderPin: '1111', sederStarted: false, createdAt: new Date().toISOString() };
    if (!rooms[STATIC_ROOM].images) rooms[STATIC_ROOM].images = {};

    const hardcodedUrls = {
        0: 'https://cdn.leonardo.ai/users/56496dd9-dbd5-4ef4-a8d9-421b8f552cd6/generations/1f12d017-9232-6680-bce9-bf5e9ec8fcb3/gemini-image-2_Real_people_at_a_Passover_seder_table_raising_ornate_silver_wine_cups_in_warm_ca-0.jpg',
        1: 'https://cdn.leonardo.ai/users/56496dd9-dbd5-4ef4-a8d9-421b8f552cd6/generations/1f12cd53-a81b-6030-9863-8ce73fa185a4/gemini-image-2_Ritual_handwashing_from_an_ancient_stone_pitcher_in_golden_light_one_person_has_-0.jpg',
        2: 'https://cdn.leonardo.ai/users/56496dd9-dbd5-4ef4-a8d9-421b8f552cd6/generations/1f12cd7a-671c-6260-9879-f7fc5dc86236/gemini-image-2_A_single_sprig_of_fresh_parsley_being_solemnly_dipped_into_a_small_bowl_of_salt_-0.jpg',
        3: 'https://cdn.leonardo.ai/users/56496dd9-dbd5-4ef4-a8d9-421b8f552cd6/generations/1f12d019-7bab-6950-ae1c-b7dc07db3d3a/gemini-image-2_A_matzah_being_broken_precisely_in_half_the_whole_family_leaning_in_watching_as_-0.jpg',
        4: 'https://cdn.leonardo.ai/users/56496dd9-dbd5-4ef4-a8d9-421b8f552cd6/generations/1f12cd84-ac83-6970-a280-7bc9cc7c7d1b/gemini-image-2_One_person_in_the_reference_images_plays_Pharaoh_%E2%80%94_imperious_gold-adorned_crow-0.jpg',
        5: 'https://cdn.leonardo.ai/users/56496dd9-dbd5-4ef4-a8d9-421b8f552cd6/generations/1f12d052-1cbb-6240-9330-53e365b7a5fc/gemini-image-2_The_three_people_from_the_reference_images_play_the_Four_Sons_one_with_arms_cros-0.jpg',
        6: 'https://cdn.leonardo.ai/users/56496dd9-dbd5-4ef4-a8d9-421b8f552cd6/generations/1f12d055-3170-6520-b456-0064c217f88e/gemini-image-2_Ancient_Hebrews_walking_away_from_Egyptian_pyramids_at_dawn_exhausted_but_free_s-0.jpg',
        7: 'https://cdn.leonardo.ai/users/56496dd9-dbd5-4ef4-a8d9-421b8f552cd6/generations/1f12d058-787b-63e0-b340-c7661cc16932/gemini-image-2_One_person_from_the_reference_images_plays_Moses_%E2%80%94_long_staff_weathered_ancien-0.jpg',
        8: 'https://cdn.leonardo.ai/users/56496dd9-dbd5-4ef4-a8d9-421b8f552cd6/generations/1f12d059-b109-6e40-8f02-4b87067c119a/gemini-image-2_Four_distinctly_different_people_at_one_seder_table_one_reading_the_Haggadah_wit-0.jpg',
        9: 'https://cdn.leonardo.ai/users/56496dd9-dbd5-4ef4-a8d9-421b8f552cd6/generations/1f12d05b-45ba-6f70-9875-ce090de69860/gemini-image-2_A_sweeping_multigenerational_family_portrait_same_pose_same_expression_across_fo-0.jpg',
        10: 'https://cdn.leonardo.ai/users/56496dd9-dbd5-4ef4-a8d9-421b8f552cd6/generations/1f12d05d-1b5b-6930-85a0-e5618c08c1f6/gemini-image-2_One_person_plays_a_Pharaoh_reacting_with_increasing_alarm_to_each_plague._The_ot-0.jpg',
        11: 'https://cdn.leonardo.ai/users/56496dd9-dbd5-4ef4-a8d9-421b8f552cd6/generations/1f12d05f-0601-60b0-be08-52dd9555ebd5/gemini-image-2_One_person_plays_the_triumphant_moment_at_the_Red_Sea_crossing_%E2%80%94_arms_raised_i-0.jpg',
        12: 'https://cdn.leonardo.ai/users/56496dd9-dbd5-4ef4-a8d9-421b8f552cd6/generations/1f12d061-0b75-64e0-95de-7644e37c279a/gemini-image-2_An_elegantly_lit_seder_plate_photographed_as_if_it_were_a_Michelin-star_restaura-0.jpg',
        13: 'https://cdn.leonardo.ai/users/56496dd9-dbd5-4ef4-a8d9-421b8f552cd6/generations/1f12d062-be30-6cf0-83f9-90f2a2baddb3/gemini-image-2_One_person_plays_Aaron_the_High_Priest_%E2%80%94_priestly_garments_officiating_the_rit-0.jpg',
        14: 'https://cdn.leonardo.ai/users/56496dd9-dbd5-4ef4-a8d9-421b8f552cd6/generations/1f12d063-f69a-6d60-aaa6-d1ac1c75006a/gemini-image-2_Spontaneous_Passover_singing_around_the_seder_table_people_of_all_ages_genuinely-0.jpg',
        15: 'https://cdn.leonardo.ai/users/56496dd9-dbd5-4ef4-a8d9-421b8f552cd6/generations/1f12d066-3237-6d80-b7c8-c72367ec2c55/gemini-image-2_Elegant_ritual_handwashing_with_an_ornate_ancient_silver_pitcher_beautiful_cerem-0.jpg',
        16: 'https://cdn.leonardo.ai/users/56496dd9-dbd5-4ef4-a8d9-421b8f552cd6/generations/1f12d068-9568-6b00-a5db-a27be9b76db8/gemini-image-2_Two_hands_blessing_two_pieces_of_matzah_aloft_in_golden_candlelight_crumbs_alrea-0.jpg',
        17: 'https://cdn.leonardo.ai/users/56496dd9-dbd5-4ef4-a8d9-421b8f552cd6/generations/1f12d069-eb34-6b00-8b1c-df01684912f1/gemini-image-2_A_lineup_of_family_members_tasting_horseradish_in_sequence_first_person_cautious-0.jpg',
        18: 'https://cdn.leonardo.ai/users/56496dd9-dbd5-4ef4-a8d9-421b8f552cd6/generations/1f12d06b-7e13-6740-8a06-47fd1b8241cf/gemini-image-2_An_enormous_Hillel_sandwich_being_assembled_with_engineering_precision_matzah_ma-0.jpg',
        19: 'https://cdn.leonardo.ai/users/56496dd9-dbd5-4ef4-a8d9-421b8f552cd6/generations/1f12d06c-f2b4-6850-8901-50874c689599/gemini-image-2_The_Passover_feast_at_full_chaos_epic_long_table_with_every_dish_competing_for_s-0.jpg',
        20: 'https://cdn.leonardo.ai/users/56496dd9-dbd5-4ef4-a8d9-421b8f552cd6/generations/1f12d06e-819e-61a0-9cde-27544d9cb4a7/gemini-image-2_Kids_in_full_heist_mode_searching_every_cushion_and_chair_for_the_hidden_afikoma-0.jpg',
        21: 'https://cdn.leonardo.ai/users/56496dd9-dbd5-4ef4-a8d9-421b8f552cd6/generations/1f12d073-d568-6f60-b6c7-63f81a716485/gemini-image-2_One_person_plays_the_role_of_Elijah_the_Prophet_%E2%80%94_appearing_mysteriously_as_th-0.jpg',
        22: 'https://cdn.leonardo.ai/users/56496dd9-dbd5-4ef4-a8d9-421b8f552cd6/generations/1f12d075-4966-6740-9f59-3077bd4176ff/gemini-image-2_Grand_finale_of_the_seder_everyone_singing_together_chairs_pushed_back_someone_s-0.jpg',
        23: 'https://cdn.leonardo.ai/users/56496dd9-dbd5-4ef4-a8d9-421b8f552cd6/generations/1f12d07a-fbce-6810-a7a3-1b3385511720/gemini-image-2_Intense_passionate_Passover_singing_some_people_eyes_closed_really_feeling_every-0.jpg',
        24: 'https://cdn.leonardo.ai/users/56496dd9-dbd5-4ef4-a8d9-421b8f552cd6/generations/1f12d07c-3255-6220-b4cd-a7e5266a7b09/gemini-image-2_One_person_plays_the_free_woman_%E2%80%94_joyful_liberated_singing_with_total_abandon_-0.jpg',
        25: '/images/haggadah/page-25.jpg',
        26: 'https://cdn.leonardo.ai/users/56496dd9-dbd5-4ef4-a8d9-421b8f552cd6/generations/1f12d080-34ca-6920-abf4-501984744ec1/gemini-image-2_One_person_plays_Miriam_the_Prophetess_%E2%80%94_tambourine_in_hand_leading_the_women_-0.jpg',
        27: '/images/haggadah/page-26.jpg', // No generation for 27, reusing 26
        28: 'https://cdn.leonardo.ai/users/56496dd9-dbd5-4ef4-a8d9-421b8f552cd6/generations/1f12d08a-f4f3-6cb0-9433-516af51e30b4/gemini-image-2_Family_counting_thirteen_things_on_their_fingers_running_out_of_fingers_and_movi-0.jpg',
        29: 'https://cdn.leonardo.ai/users/56496dd9-dbd5-4ef4-a8d9-421b8f552cd6/generations/1f12d08f-5b34-61b0-8bd8-0638cd90a380/gemini-image-2_Small_group_sitting_outside_under_an_extraordinary_desert_night_sky_the_Milky_Wa-0.jpg',
        30: 'https://cdn.leonardo.ai/users/56496dd9-dbd5-4ef4-a8d9-421b8f552cd6/generations/1f12d092-7f63-6b00-a8fe-bbb1e5fe9fc0/gemini-image-2_Ancient_Israelites_crossing_the_desert_but_with_very_modern_energy_mismatched_ef-0.jpg',
        31: 'https://cdn.leonardo.ai/users/56496dd9-dbd5-4ef4-a8d9-421b8f552cd6/generations/1f12d093-d08a-6b90-b61e-33ba61b420e5/gemini-image-2_Magical_outdoor_gathering_after_the_seder_ends_fairy_lights_in_ancient_olive_tre-0.jpg',
        32: 'https://cdn.leonardo.ai/users/56496dd9-dbd5-4ef4-a8d9-421b8f552cd6/generations/1f12d096-dab3-6b50-b705-db100f12f99f/gemini-image-2_The_very_end_of_the_seder_sleepy_satisfied_faces_around_the_table_wine_glasses_e-0.jpg'
    };

    let loaded = 0;
    for (const [pageIndex, url] of Object.entries(hardcodedUrls)) {
        rooms[STATIC_ROOM].images[pageIndex] = { url, featuredPhotos: [] };
        loaded++;
    }
    if (loaded > 0) console.log(`[Static] Force loaded ${loaded} hardcoded Leonardo images for room ${STATIC_ROOM}`);
})();

// --- Selfie persistence ---
const SELFIES_FILE = path.join(DATA_DIR, 'selfies.json');
let selfies = {}; // { fingerprint: photoDataUrl }
try {
    if (fs.existsSync(SELFIES_FILE)) selfies = JSON.parse(fs.readFileSync(SELFIES_FILE, 'utf8'));
    console.log(`[Selfies] Loaded ${Object.keys(selfies).length} saved selfies.`);
} catch(e) { console.error('Failed to load selfies:', e); }

function saveSelfies() {
    try { fs.writeFileSync(SELFIES_FILE, JSON.stringify(selfies)); } catch(e) {}
}

function getParticipantsWithStatus(room) {
    const now = Date.now();
    return room.participants.map(p => ({
        ...p,
        active: p.online && p.lastSeen && (now - p.lastSeen) < 8000
    }));
}

function saveTasks(roomId, tasks) {
    try {
        if (roomId && tasks) {
            persistedTasks[roomId] = tasks;
        }
        fs.writeFileSync(TASKS_FILE, JSON.stringify(persistedTasks, null, 2));
    } catch (e) { console.error('Failed to save tasks:', e); }
}

io.on('connection', (socket) => {
    console.log(`+ Connected: ${socket.id}`);

    // Send current version immediately
    socket.emit('version-sync', { version: serverVersion });

    socket.on('google-login', async ({ credential }) => {
        try {
            const ticket = await client.verifyIdToken({
                idToken: credential,
                audience: CLIENT_ID,
            });
            const payload = ticket.getPayload();
            const userData = {
                id: payload.sub,
                name: payload.name,
                email: payload.email,
                picture: payload.picture,
                isLeader: false  // Leadership is open — claimed via take-lead, not by email
            };
            socket.userEmail = payload.email;
            console.log(`[Auth] User logged in: ${userData.name} (${socket.userEmail})`);
            socket.emit('google-login-success', userData);
        } catch (err) {
            console.error('[Auth] Login failed:', err.message);
            socket.emit('google-login-error', { message: 'אימות נכשל' });
        }
    });

    // Test-mode login — bypasses Google auth entirely
    socket.on('test-login', ({ role }, callback) => {
        if (!TEST_MODE) {
            return callback?.({ error: 'Test mode is not enabled' });
        }
        const isHost = role === 'host';
        const userData = {
            id: isHost ? 'test_host_001' : 'test_guest_' + Math.random().toString(36).slice(2, 8),
            name: isHost ? 'מנחה (מצב בדיקה)' : 'אורח (מצב בדיקה)',
            email: isHost ? 'test-host@pesach-local.dev' : null,  // Fake email — not in LEADERS
            picture: null,
            isGuest: !isHost
        };
        if (isHost) {
            socket.userEmail = userData.email;
            // In test mode, manually grant leader for the test host socket
            if (socket.roomId && rooms[socket.roomId]) {
                rooms[socket.roomId].leaderId = socket.id;
                rooms[socket.roomId].leaderName = userData.name;
            }
        }
        console.log(`[TEST] ${isHost ? 'Host' : 'Guest'} logged in: ${userData.name} (socket ${socket.id})`);
        socket.emit('google-login-success', { ...userData, isLeader: isHost });
        callback?.({ success: true, userData });
    });

    socket.on('create-room', ({ leaderPin, name } = {}, callback) => {
        // Support both old signature (callback only) and new (data, callback)
        if (typeof leaderPin === 'function') { callback = leaderPin; leaderPin = null; name = null; }
        const roomId = generateId();
        if (name) socket.userName = name;
        rooms[roomId] = {
            id: roomId,
            participants: [],
            currentPage: 0,
            guestList: [],       // Pre-set expected guests (names only)
            sederLabel: '',
            tasks: persistedTasks[roomId] || [
                { id: 'h1', text: '✅ תכנון MVP ראשוני', completed: true, author: 'אורן (מנהל פרויקט)' },
                { id: 'h2', text: '✅ הקמת שרת (Express, Socket.io)', completed: true, author: 'אורן (מנהל פרויקט)' },
                { id: 'h3', text: '✅ סנכרון קריאה בזמן אמת', completed: true, author: 'אורן (מנהל פרויקט)' },
                { id: 'h4', text: '✅ פיצ\'ר סלפי/פולארויד', completed: true, author: 'אורן (מנהל פרויקט)' },
                { id: 'h5', text: '✅ ניקוי ושיפור ממשק (Premium UI)', completed: true, author: 'אורן (מנהל פרויקט)' },
                { id: 'h6', text: '✅ אינטגרציה מלאה: הגדה עברית-אנגלית', completed: true, author: 'אורן (מנהל פרויקט)' },
                { id: 'h7', text: '✅ תשתית ייצור תמונות AI (Leonardo)', completed: true, author: 'אורן (מנהל פרויקט)' },
                { id: 'h8', text: '✅ אפליקציה מותקנת (PWA)', completed: true, author: 'אורן (מנהל פרויקט)' },
                { id: 'h9', text: '✅ התחברות גוגל (Google Login)', completed: true, author: 'אורן (מנהל פרויקט)' },
                { id: 'h10', text: '✅ סנכרון גרסאות ורענון אוטומטי', completed: true, author: 'אורן (מנהל פרויקט)' },
                { id: 'h11', text: '✅ תיקון באג ה-Undefined במשימות', completed: true, author: 'אורן (מנהל פרויקט)' },
                { id: 'h12', text: '✅ התנתקות וניקוי סשן (Sign Out)', completed: true, author: 'אורן (מנהל פרויקט)' },
                { id: 'dev-1', text: '👑 שליטת מנהל (Host Controls)', completed: false, author: 'אורן (מנהל פרויקט)' },
                { id: 'dev-2', text: '🩸 אנימציות ואפקטים ויזואליים', completed: false, author: 'אורן (מנהל פרויקט)' },
                { id: 'dev-3', text: '🤖 שדרוג יכולות ה-AI', completed: false, author: 'אורן (מנהל פרויקט)' },
                { id: 'dev-4', text: '☁️ חיבור למסד נתונים', completed: false, author: 'אורן (מנהל פרויקט)' },
                { id: 'dev-5', text: '🎥 שילוב אודיו / וידאו', completed: false, author: 'אורן (מנהל פרויקט)' }
            ],
            leaderId: null,
            leaderName: null,
            leaderPin: '1111',
            sederStarted: false,
            createdAt: new Date().toISOString()
        };
        console.log(`Room created: ${roomId}`);
        saveRooms();

        callback({ roomId });
    });

    socket.on('join-room', ({ roomId, photo, userEmail, name }, callback) => {
        if (userEmail) socket.userEmail = userEmail;
        if (name) socket.userName = name;
        if (!rooms[roomId]) {
            rooms[roomId] = {
                id: roomId,
                currentPage: 0,
                participants: [],
                images: {},
                tasks: persistedTasks[roomId] || [
                    { id: 'h1', text: '✅ תכנון MVP ראשוני', completed: true, author: 'אורן (מנהל פרויקט)' },
                    { id: 'h2', text: '✅ הקמת שרת (Express, Socket.io)', completed: true, author: 'אורן (מנהל פרויקט)' },
                    { id: 'h3', text: '✅ סנכרון קריאה בזמן אמת', completed: true, author: 'אורן (מנהל פרויקט)' },
                    { id: 'h4', text: '✅ פיצ\'ר סלפי/פולארויד', completed: true, author: 'אורן (מנהל פרויקט)' },
                    { id: 'h5', text: '✅ ניקוי ושיפור ממשק (Premium UI)', completed: true, author: 'אורן (מנהל פרויקט)' },
                    { id: 'h6', text: '✅ אינטגרציה מלאה: הגדה עברית-אנגלית', completed: true, author: 'אורן (מנהל פרויקט)' },
                    { id: 'h7', text: '✅ תשתית ייצור תמונות AI (Leonardo)', completed: true, author: 'אורן (מנהל פרויקט)' },
                    { id: 'h8', text: '✅ אפליקציה מותקנת (PWA)', completed: true, author: 'אורן (מנהל פרויקט)' },
                    { id: 'h9', text: '✅ התחברות גוגל (Google Login)', completed: true, author: 'אורן (מנהל פרויקט)' },
                    { id: 'h10', text: '✅ סנכרון גרסאות ורענון אוטומטי', completed: true, author: 'אורן (מנהל פרויקט)' },
                    { id: 'h11', text: '✅ תיקון באג ה-Undefined במשימות', completed: true, author: 'אורן (מנהל פרויקט)' },
                    { id: 'h12', text: '✅ התנתקות וניקוי סשן (Sign Out)', completed: true, author: 'אורן (מנהל פרויקט)' },
                    { id: 'dev-1', text: '👑 שליטת מנהל (Host Controls)', completed: false, author: 'אורן (מנהל פרויקט)' },
                    { id: 'dev-2', text: '🩸 אנימציות ואפקטים ויזואליים', completed: false, author: 'אורן (מנהל פרויקט)' },
                    { id: 'dev-3', text: '🤖 שדרוג יכולות ה-AI', completed: false, author: 'אורן (מנהל פרויקט)' },
                    { id: 'dev-4', text: '☁️ חיבור למסד נתונים', completed: false, author: 'אורן (מנהל פרויקט)' },
                    { id: 'dev-5', text: '🎥 שילוב אודיו / וידאו', completed: false, author: 'אורן (מנהל פרויקט)' }
                ],
                leaderId: null,
                leaderName: null,
                leaderPin: '1111',
                sederStarted: false,
                createdAt: new Date().toISOString()
            };
        }

        const room = rooms[roomId];
        socket.roomId = roomId; // Set this early!
        socket.join(roomId);

        // Save selfie if new, restore saved selfie if this socket has none
        const photoKey = socket.userEmail || socket.id;
        if (photo) {
            selfies[photoKey] = photo;
            saveSelfies();
        }
        const resolvedPhoto = photo || selfies[photoKey] || null;

        const participant = {
            id: socket.id,
            name: socket.userName || null,
            photo: resolvedPhoto,
            guestCount: 1,
            online: true,
            lastSeen: Date.now()
        };

        // Match by photo first, then by pre-registered name
        const existingByPhoto = resolvedPhoto && room.participants.find(p => p.photo && p.photo === resolvedPhoto);
        const preRegByName = !existingByPhoto && socket.userName && room.participants.find(p =>
            p.preRegistered && p.name.trim().toLowerCase() === socket.userName.trim().toLowerCase()
        );

        if (existingByPhoto) {
            existingByPhoto.id = socket.id;
            existingByPhoto.online = true;
            existingByPhoto.lastSeen = Date.now();
            if (socket.userName) existingByPhoto.name = socket.userName;
            // Sync resolved participant for callback
            Object.assign(participant, existingByPhoto);
        } else if (preRegByName) {
            // Merge into pre-registered slot — use their pre-loaded photo if they didn't upload one
            preRegByName.id = socket.id;
            preRegByName.online = true;
            preRegByName.preRegistered = false;
            preRegByName.lastSeen = Date.now();
            if (resolvedPhoto) preRegByName.photo = resolvedPhoto;
            if (!preRegByName.photo) preRegByName.photo = null;
            Object.assign(participant, preRegByName);
        } else {
            room.participants.push(participant);
        }
        saveRooms();

        console.log(`User ${socket.id} joined room ${roomId}`);

        if (callback) {
            callback({
                success: true,
                roomId,
                participant,
                currentPage: room.currentPage,
                sederStarted: room.sederStarted,
                sederEnded: room.sederEnded,
                pageLocked: room.pageLocked,
                images: room.images,
                tasks: room.tasks,
                leaderId: room.leaderId,
                leaderName: room.leaderName,
                sederLabel: room.sederLabel || '',
                participants: room.participants
            });
        }

        io.to(roomId).emit('room-updated', { 
            participants: room.participants,
            sederStarted: room.sederStarted,
            leaderId: room.leaderId,
            leaderName: room.leaderName
        });
    });

    socket.on('update-profile', ({ roomId, photo }) => {
        const room = rooms[roomId];
        if (!room) return;
        const p = room.participants.find(p => p.id === socket.id);
        if (p) {
            if (photo) p.photo = photo;
            p.guestCount = 1;
            saveRooms();
            io.to(roomId).emit('room-updated', { 
                participants: room.participants,
                sederStarted: room.sederStarted 
            });
        }
    });

    socket.on('set-seder-label', ({ roomId, label }) => {
        if (!rooms[roomId]) return;
        rooms[roomId].sederLabel = (label || '').slice(0, 60);
        io.to(roomId).emit('seder-label-updated', { label: rooms[roomId].sederLabel });
    });

    socket.on('take-lead', ({ roomId, name }) => {
        const room = rooms[roomId];
        if (!room) return;
        // Block free take-lead if room has a PIN — must use claim-lead-with-pin
        if (room.leaderPin) {
            socket.emit('toast-broadcast', { message: 'נדרש קוד מנחה 🔑' });
            return;
        }
        room.leaderId = socket.id;
        room.leaderName = name || 'מנחה';
        console.log(`Leadership taken in room ${roomId} by ${room.leaderName}`);
        saveRooms();
        io.to(roomId).emit('leader-updated', { leaderId: socket.id, leaderName: room.leaderName });
    });

    // Peek at a room's participants without joining (for name picker in RSVP)
    socket.on('peek-room', ({ roomId }, callback) => {
        const room = rooms[roomId];
        if (!room) return callback?.({ exists: false, participants: [] });
        const joined = room.participants.map(p => ({ name: p.name, photo: p.photo }));
        const joinedNames = new Set(joined.map(p => p.name));
        // Include expected guests not yet joined (shown as pending in name picker)
        const pending = (room.guestList || [])
            .filter(n => !joinedNames.has(n))
            .map(n => ({ name: n, photo: null, pending: true }));
        callback?.({ exists: true, participants: [...joined, ...pending] });
    });

    // Host sets the pre-populated guest name list
    socket.on('set-guest-list', ({ roomId, names }, callback) => {
        const room = rooms[roomId];
        if (!room) return callback?.({ success: false });
        if (room.leaderId !== socket.id) return callback?.({ success: false, reason: 'not leader' });
        room.guestList = (names || []).map(n => String(n).trim()).filter(Boolean);
        callback?.({ success: true, count: room.guestList.length });
    });

    // Claim leader status using the room PIN (replaces Google-based host auth)
    socket.on('claim-lead-with-pin', ({ roomId, pin }, callback) => {
        const room = rooms[roomId];
        if (!room) return callback?.({ success: false, reason: 'room not found' });
        if (!room.leaderPin) return callback?.({ success: false, reason: 'no pin set' });
        if (room.leaderPin !== String(pin)) return callback?.({ success: false, reason: 'wrong pin' });
        room.leaderId   = socket.id;
        room.leaderName = socket.userName || 'מנחה';
        console.log(`[PIN] Leadership claimed in room ${roomId} by ${room.leaderName}`);
        saveRooms();
        io.to(roomId).emit('leader-updated', { leaderId: socket.id, leaderName: room.leaderName });
        io.to(roomId).emit('toast-broadcast', { message: `👑 ${room.leaderName} הוא/היא המנחה!` });
        callback?.({ success: true });
    });

    // Leader grants leadership to any participant (bypasses email check)
    socket.on('grant-leader', ({ roomId, targetSocketId }) => {
        if (!rooms[roomId]) return;
        if (socket.id !== rooms[roomId].leaderId) {
            console.log(`[Leader] grant-leader denied — ${socket.id} is not the current leader`);
            return;
        }
        const room = rooms[roomId];
        const targetParticipant = room.participants.find(p => p.id === targetSocketId);
        room.leaderId = targetSocketId;
        room.leaderName = targetParticipant?.name || 'מנחה';
        console.log(`[Leader] ${socket.userEmail} granted leadership to ${targetSocketId} (${room.leaderName})`);
        saveRooms();
        io.to(roomId).emit('leader-updated', { leaderId: targetSocketId, leaderName: room.leaderName });
        io.to(roomId).emit('toast-broadcast', { message: `👑 ${room.leaderName} הפך/ה למנחה החדש/ה!` });
    });

    socket.on('trigger-effect', ({ roomId, effectType }) => {
        if (!rooms[roomId]) return;
        io.to(roomId).emit('effect-triggered', { effectType, authorId: socket.id });
    });

    // Leader kicks a participant out of the room
    socket.on('kick-participant', ({ roomId, targetSocketId }) => {
        if (!rooms[roomId]) return;
        if (socket.id !== rooms[roomId].leaderId) return;
        const targetSocket = io.sockets.sockets.get(targetSocketId);
        if (targetSocket) {
            targetSocket.emit('you-were-kicked');
            targetSocket.leave(roomId);
        }
        rooms[roomId].participants = rooms[roomId].participants.filter(p => p.id !== targetSocketId);
        saveRooms();
        io.to(roomId).emit('room-updated', {
            participants: rooms[roomId].participants,
            leaderId: rooms[roomId].leaderId,
            leaderName: rooms[roomId].leaderName
        });
        console.log(`[Kick] ${targetSocketId} kicked from room ${roomId} by ${socket.id}`);
    });

    // Leader locks/unlocks free navigation for guests
    socket.on('set-page-lock', ({ roomId, locked }) => {
        if (!rooms[roomId]) return;
        if (socket.id !== rooms[roomId].leaderId) return;
        rooms[roomId].pageLocked = !!locked;
        saveRooms();
        io.to(roomId).emit('page-lock-updated', { locked: rooms[roomId].pageLocked });
    });

    // Broadcast feedback from any participant to the whole room
    socket.on('broadcast-feedback', ({ roomId, message }) => {
        if (!rooms[roomId]) return;
        io.to(roomId).emit('toast-broadcast', { message });
    });

    // Leader ends the seder — sends everyone to gallery
    socket.on('end-seder', ({ roomId }) => {
        if (!rooms[roomId]) return;
        if (socket.id !== rooms[roomId].leaderId) return;
        rooms[roomId].sederEnded = true;
        saveRooms();
        io.to(roomId).emit('seder-ended', { images: rooms[roomId].images || {} });
    });

    // Emoji reaction on a page
    socket.on('page-react', ({ roomId, pageIndex, emoji }) => {
        if (!rooms[roomId]) return;
        if (!rooms[roomId].reactions) rooms[roomId].reactions = {};
        if (!rooms[roomId].reactions[pageIndex]) rooms[roomId].reactions[pageIndex] = {};
        const prev = rooms[roomId].reactions[pageIndex][socket.id];
        if (prev === emoji) {
            delete rooms[roomId].reactions[pageIndex][socket.id]; // toggle off
        } else {
            rooms[roomId].reactions[pageIndex][socket.id] = emoji;
        }
        io.to(roomId).emit('reactions-updated', { pageIndex, reactions: rooms[roomId].reactions[pageIndex] });
    });

    // מי יודע: volunteer join/leave
    socket.on('mi-yodea-join', ({ roomId, slotNum, participant }) => {
        if (!rooms[roomId]) return;
        if (!rooms[roomId].miYodea) rooms[roomId].miYodea = {};
        if (!rooms[roomId].miYodea[slotNum]) rooms[roomId].miYodea[slotNum] = [];
        const slot = rooms[roomId].miYodea[slotNum];
        if (slot.length >= 6) return; // max 6
        if (!slot.find(p => p.id === participant.id)) slot.push(participant);
        io.to(roomId).emit('mi-yodea-updated', { slotNum, participants: slot });
    });

    socket.on('mi-yodea-leave', ({ roomId, slotNum, participant }) => {
        if (!rooms[roomId] || !rooms[roomId].miYodea) return;
        const slot = rooms[roomId].miYodea[slotNum] || [];
        rooms[roomId].miYodea[slotNum] = slot.filter(p => p.id !== participant.id);
        io.to(roomId).emit('mi-yodea-updated', { slotNum, participants: rooms[roomId].miYodea[slotNum] });
    });

    // מי יודע: leader triggers AI image generation for a slot
    socket.on('mi-yodea-generate', ({ roomId, slotNum }) => {
        if (!rooms[roomId]) return;
        if (rooms[roomId].leaderId !== socket.id) return;
        const participants = (rooms[roomId].miYodea || {})[slotNum] || [];
        const selfies = participants.map(p => p.photo).filter(Boolean);
        const numHe = ['','אחד','שניים','שלושה','ארבעה','חמישה','שישה','שבעה','שמונה','תשעה','עשרה','אחד עשר','שנים עשר','שלושה עשר'][slotNum] || slotNum;
        const prompt = `מי יודע ${numHe}? — אנשים מסביב לשולחן סדר פסח, חגיגי, ישראלי, מגוון, רגשי, אנלוגי מחומם`;
        generatePersonalizedPage(roomId, `mi-yodea-${slotNum}`, io, rooms, { prompt, selfies }).then(() => {
            const imageUrl = rooms[roomId].images?.[`mi-yodea-${slotNum}`]?.url;
            if (imageUrl) io.to(roomId).emit('mi-yodea-image-ready', { slotNum, imageUrl });
        }).catch(err => {
            io.to(roomId).emit('toast-broadcast', { message: `שגיאה ביצירת תמונה ${slotNum}: ${err.message}` });
        });
    });

    socket.on('generate-page', ({ roomId, pageIndex }) => {
        if (!rooms[roomId]) return;
        // AI generation is restricted to the current leader — protects Leonardo token quota
        if (rooms[roomId].leaderId !== socket.id) {
            socket.emit('ai-error', { message: 'רק עורך הסדר יכול להתחיל יצירת תמונה!', pageIndex });
            return;
        }
        generatePersonalizedPage(roomId, pageIndex, io, rooms, { saveToFirebase: saveImageToFirebase })
            .then(() => saveImageCache())
            .catch(err => {
                io.to(roomId).emit('ai-error', { message: 'שגיאת מערכת: ' + err.message, pageIndex });
            });
    });

    socket.on('start-seder', ({ roomId }) => {
        const room = rooms[roomId];
        if (!room) return;
        if (socket.id !== room.leaderId) return;
        room.sederStarted = true;
        room.currentPage = 0;
        io.to(roomId).emit('seder-started', { currentPage: room.currentPage });
        saveRooms();
    });

    socket.on('change-page', ({ roomId, pageIndex }) => {
        if (!rooms[roomId]) return;
        // Only the current leader can drive navigation for everyone
        if (socket.id !== rooms[roomId].leaderId) return;
        rooms[roomId].currentPage = pageIndex;
        rooms[roomId].highlightedSegment = -1;
        saveRooms();
        io.to(roomId).emit('page-updated', { pageIndex, authorId: socket.id });
    });

    socket.on('set-highlight', ({ roomId, pageIndex, segmentIndex }) => {
        if (!rooms[roomId]) return;
        rooms[roomId].highlightedSegment = segmentIndex;
        const highlighter = rooms[roomId].participants.find(p => p.id === socket.id);

        // Track per-user paragraph position
        if (!rooms[roomId].paragraphTaps) rooms[roomId].paragraphTaps = {};
        if (segmentIndex >= 0) {
            rooms[roomId].paragraphTaps[socket.id] = {
                segmentIndex, pageIndex,
                name: highlighter?.name || 'משתתף',
                photo: highlighter?.photo || null
            };
        } else {
            delete rooms[roomId].paragraphTaps[socket.id];
        }

        // Broadcast updated taps to everyone (including sender)
        io.to(roomId).emit('paragraphs-updated', {
            pageIndex,
            taps: rooms[roomId].paragraphTaps
        });
    });

    socket.on('toggle-reading', ({ roomId }) => {
        if (!rooms[roomId]) return;
        const p = rooms[roomId].participants.find(p => p.id === socket.id);
        if (p) {
            p.isReading = !p.isReading;
            // Broadcast updated readers list to everyone
            const readers = rooms[roomId].participants
                .filter(p => p.isReading && p.online)
                .map(p => ({ id: p.id, photo: p.photo }));
            io.to(roomId).emit('readers-updated', { readers });
        }
    });

    socket.on('add-task', ({ roomId, text, author }) => {
        if (!rooms[roomId]) return;
        const task = { id: Date.now().toString(), text, author: author || 'אורח', completed: false };
        rooms[roomId].tasks.push(task);
        saveTasks(roomId, rooms[roomId].tasks);
        io.to(roomId).emit('tasks-updated', { tasks: rooms[roomId].tasks });
    });

    socket.on('toggle-task', ({ roomId, taskId }) => {
        if (!rooms[roomId]) return;
        const task = rooms[roomId].tasks.find(t => t.id === taskId);
        if (task) {
            task.completed = !task.completed;
            saveTasks(roomId, rooms[roomId].tasks);
            io.to(roomId).emit('tasks-updated', { tasks: rooms[roomId].tasks, completedTask: task.completed ? task.text : null });
        }
    });

    socket.on('delete-task', ({ roomId, taskId }) => {
        if (!rooms[roomId]) return;
        rooms[roomId].tasks = rooms[roomId].tasks.filter(t => t.id !== taskId);
        saveTasks(roomId, rooms[roomId].tasks);
        io.to(roomId).emit('tasks-updated', { tasks: rooms[roomId].tasks });
    });

    // test-nano-banana: legacy dev test — now a no-op (replaced by /api/generate-invitation)
    socket.on('test-nano-banana', ({ roomId }) => {
        if (!rooms[roomId]) return;
        console.log('[test-nano-banana] No-op (use /api/generate-invitation instead)');
    });

    // Heartbeat: client pings to show they're still watching
    socket.on('heartbeat', ({ roomId }) => {
        if (!rooms[roomId]) return;
        const p = rooms[roomId].participants.find(p => p.id === socket.id);
        if (p) {
            p.lastSeen = Date.now();
            p.online = true;
            // Broadcast updated statuses
            io.to(roomId).emit('room-updated', {
                participants: getParticipantsWithStatus(rooms[roomId]),
                sederStarted: rooms[roomId].sederStarted,
                leaderId: rooms[roomId].leaderId,
                leaderName: rooms[roomId].leaderName,
                currentPage: rooms[roomId].currentPage
            });
        }
    });

    socket.on('disconnect', () => {
        const roomId = socket.roomId;
        if (!roomId || !rooms[roomId]) return;
        const room = rooms[roomId];
        const p = room.participants.find(p => p.id === socket.id);
        if (p) {
            p.online = false;
            if (!p.photo) {
                room.participants = room.participants.filter(x => x.id !== socket.id);
            }
        }

        // Auto-promote: if the leader left, give leadership to the next online participant
        if (room.leaderId === socket.id) {
            const nextLeader = room.participants.find(x => x.online !== false && x.id !== socket.id);
            if (nextLeader) {
                room.leaderId = nextLeader.id;
                room.leaderName = nextLeader.name;
                io.to(roomId).emit('leader-updated', { leaderId: nextLeader.id, leaderName: nextLeader.name });
                io.to(roomId).emit('toast-broadcast', { message: `👑 ${nextLeader.name} הפך/ה למנחה` });
            } else {
                room.leaderId = null;
                room.leaderName = null;
            }
        }

        saveRooms();
        io.to(roomId).emit('room-updated', { participants: room.participants, currentPage: room.currentPage, leaderId: room.leaderId, leaderName: room.leaderName });
    });
});

const PORT = process.env.PORT || 3004;
server.listen(PORT, '0.0.0.0', () => console.log(`[Haggadah] Ashkenaz version running -> http://localhost:${PORT}`));
