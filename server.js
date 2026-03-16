const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const { generateAllImages, generateNanoTest } = require('./leonardo');
const { OAuth2Client } = require('google-auth-library');

const CLIENT_ID = '256326772055-e29p61798pa9npj533mb08i05en55956.apps.googleusercontent.com';
const client = new OAuth2Client(CLIENT_ID);

// Co-leader registry — add emails here to grant full host privileges
const LEADERS = {
    'oren001@gmail.com':          'אורן (מנהל הסדר)',
    'bobomomo234@gmail.com':       'איתי (מנחה)'
};
function isAllowedLeader(email) {
    return !!(email && LEADERS[email.toLowerCase()]);
}
function leaderDisplayName(email) {
    return (email && LEADERS[email.toLowerCase()]) || 'מנחה';
}

const app = express();

// Required by Google Identity Services to allow the popup to communicate with the main window
app.use((req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    next();
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

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
const TASKS_FILE = path.join(DATA_DIR, 'tasks.json');
const ROOMS_FILE = path.join(DATA_DIR, 'rooms.json');

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
        }
        console.log(`[Persistence] Restored ${Object.keys(rooms).length} rooms.`);
    }
} catch (e) { console.error('Failed to load rooms:', e); }

function saveRooms() {
    try {
        // Don't save photo data inside rooms (save separately)
        const roomsToSave = {};
        for (const id in rooms) {
            roomsToSave[id] = {
                ...rooms[id],
                participants: rooms[id].participants.map(p => ({
                    ...p,
                    photo: undefined // Strip photos from room file; they're in selfies.json
                }))
            };
        }
        fs.writeFileSync(ROOMS_FILE, JSON.stringify(roomsToSave, null, 2));
    } catch (e) { console.error('Failed to save rooms:', e); }
}

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
                picture: payload.picture
            };
            socket.userEmail = payload.email; // Store for leadership checks
            console.log(`[Auth] User logged in: ${userData.name} (${socket.userEmail})`);
            
            // Proactively assign leadership if an allowed leader joins/refreshes and is already in a room
            if (isAllowedLeader(socket.userEmail) && socket.roomId) {
                const room = rooms[socket.roomId];
                if (room) {
                    room.leaderId = socket.id;
                    room.leaderName = leaderDisplayName(socket.userEmail);
                    console.log(`[Leader] ${socket.userEmail} re-authenticated. Leadership restored in room ${socket.roomId}`);
                    saveRooms();
                    io.to(socket.roomId).emit('leader-updated', { leaderId: socket.id, leaderName: room.leaderName });
                    io.to(socket.roomId).emit('room-updated', { 
                        participants: room.participants,
                        sederStarted: room.sederStarted,
                        leaderId: room.leaderId,
                        leaderName: room.leaderName
                    });
                }
            }

            socket.emit('google-login-success', userData);
        } catch (err) {
            console.error('[Auth] Login failed:', err.message);
            socket.emit('google-login-error', { message: 'אימות נכשל' });
        }
    });

    socket.on('create-room', (callback) => {
        const roomId = generateId();
        rooms[roomId] = {
            id: roomId,
            participants: [],
            currentPage: 0,
            leaderId: null,
            leaderName: null,
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
                sederStarted: false,
                createdAt: new Date().toISOString()
            };
        }

        const room = rooms[roomId];
        socket.roomId = roomId; // Set this early!
        socket.join(roomId);

        // Assign leader for any allowed co-leader
        if (isAllowedLeader(socket.userEmail)) {
            room.leaderId = socket.id;
            room.leaderName = leaderDisplayName(socket.userEmail);
            console.log(`[Leader] ${socket.userEmail} identified as leader in room ${roomId}`);
        }

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

        const existing = room.participants.find(p => p.photo && p.photo === resolvedPhoto);
        if (existing) {
            existing.id = socket.id;
            existing.online = true;
            existing.lastSeen = Date.now();
            if (socket.userName) existing.name = socket.userName;
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
                images: room.images,
                tasks: room.tasks,
                leaderId: room.leaderId,
                leaderName: room.leaderName
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

    socket.on('take-lead', ({ roomId, name }) => {
        if (!rooms[roomId]) return;
        
        // Only allowed co-leaders can take lead
        if (!isAllowedLeader(socket.userEmail)) {
            console.log(`[Leader] Leadership denied for ${socket.id} (${socket.userEmail})`);
            return;
        }

        rooms[roomId].leaderId = socket.id;
        rooms[roomId].leaderName = name || leaderDisplayName(socket.userEmail);
        console.log(`Leadership taken in room ${roomId} by ${rooms[roomId].leaderName}`);
        saveRooms();
        io.to(roomId).emit('leader-updated', { leaderId: socket.id, leaderName: rooms[roomId].leaderName });
    });

    // Leader grants leadership to any participant (bypasses email check)
    socket.on('grant-leader', ({ roomId, targetSocketId }) => {
        if (!rooms[roomId]) return;
        if (socket.id !== rooms[roomId].leaderId && !isAllowedLeader(socket.userEmail)) {
            console.log(`[Leader] grant-leader denied for ${socket.id} (${socket.userEmail})`);
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

    socket.on('generate-page', ({ roomId, pageIndex }) => {
        if (!rooms[roomId]) return;
        if (rooms[roomId].leaderId !== socket.id && !isAllowedLeader(socket.userEmail)) {
            socket.emit('ai-error', { message: 'רק עורך הסדר יכול להתחיל יצירת תמונה!', pageIndex });
            return;
        }
        const { generatePersonalizedPage } = require('./leonardo');
        generatePersonalizedPage(roomId, pageIndex, io, rooms).catch(err => {
            io.to(roomId).emit('ai-error', { message: 'שגיאת מערכת: ' + err.message, pageIndex });
        });
    });

    socket.on('start-seder', ({ roomId }) => {
        const room = rooms[roomId];
        if (!room) return;
        if (socket.id !== room.leaderId && !isAllowedLeader(socket.userEmail)) return;
        room.sederStarted = true;
        room.currentPage = 0;
        io.to(roomId).emit('seder-started', { currentPage: room.currentPage });
        saveRooms();
    });

    socket.on('change-page', ({ roomId, pageIndex }) => {
        if (!rooms[roomId]) return;
        // Allow current leader OR any allowed co-leader to change pages
        if (socket.id !== rooms[roomId].leaderId && !isAllowedLeader(socket.userEmail)) return;
        // If a co-leader (not yet leaderId) is driving, make them the active leader
        if (isAllowedLeader(socket.userEmail) && socket.id !== rooms[roomId].leaderId) {
            rooms[roomId].leaderId = socket.id;
            rooms[roomId].leaderName = leaderDisplayName(socket.userEmail);
            io.to(roomId).emit('leader-updated', { leaderId: socket.id, leaderName: rooms[roomId].leaderName });
        }
        rooms[roomId].currentPage = pageIndex;
        rooms[roomId].highlightedSegment = -1;
        saveRooms();
        io.to(roomId).emit('page-updated', { pageIndex, authorId: socket.id });
    });

    socket.on('set-highlight', ({ roomId, pageIndex, segmentIndex }) => {
        if (!rooms[roomId]) return;
        rooms[roomId].highlightedSegment = segmentIndex;
        // Include highlighter info so others can see who is reading
        const highlighter = rooms[roomId].participants.find(p => p.id === socket.id);
        socket.to(roomId).emit('highlight-updated', {
            pageIndex, segmentIndex,
            highlighterName: highlighter ? (highlighter.name || 'משתתף') : null,
            highlighterPhoto: highlighter ? highlighter.photo : null
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

    socket.on('test-nano-banana', ({ roomId }) => {
        if (!rooms[roomId]) return;
        if (rooms[roomId].leaderId !== socket.id && !isAllowedLeader(socket.userEmail)) return;
        generateNanoTest(roomId, io, rooms).catch(err => {
            io.to(roomId).emit('ai-error', { message: 'שגיאת Leonardo: ' + err.message });
        });
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
        const p = rooms[roomId].participants.find(p => p.id === socket.id);
        if (p) {
            p.online = false;
            if (!p.photo) {
                rooms[roomId].participants = rooms[roomId].participants.filter(x => x.id !== socket.id);
            }
        }
        saveRooms();
        io.to(roomId).emit('room-updated', { participants: rooms[roomId].participants, currentPage: rooms[roomId].currentPage, leaderId: rooms[roomId].leaderId, leaderName: rooms[roomId].leaderName });
    });
});

const PORT = process.env.PORT || 3004;
server.listen(PORT, () => console.log(`[Haggadah] Ashkenaz version running -> http://localhost:${PORT}`));
