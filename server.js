const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const { generateAllImages, generateNanoTest } = require('./leonardo');
const { OAuth2Client } = require('google-auth-library');

const CLIENT_ID = '256326772055-e29p61798pa9npj533mb08i05en55956.apps.googleusercontent.com';
const client = new OAuth2Client(CLIENT_ID);

const app = express();

// Required by Google Identity Services to allow the popup to communicate with the main window
app.use((req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    next();
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Version state
let serverVersion = '1.0.0';
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

// Load persisted tasks
let persistedTasks = {};
try {
    if (fs.existsSync(TASKS_FILE)) {
        persistedTasks = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8'));
    }
} catch (e) { console.error('Failed to load tasks:', e); }

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
            console.log(`[Auth] User logged in: \${userData.name}`);
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
            currentPage: 0,
            participants: [],
            images: {}, // Cache for AI images
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
            ]
        };
        console.log(`Room created: ${roomId}`);

        callback({ roomId });
    });

    socket.on('join-room', ({ roomId, photo }, callback) => {
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
                ]
            };
        }

        const participant = { id: socket.id, photo: photo || null };
        rooms[roomId].participants.push(participant);
        socket.join(roomId);
        socket.roomId = roomId; // Store roomId on socket for disconnect

        console.log(`User ${socket.id} joined room ${roomId}`);

        if (callback) {
            callback({
                success: true,
                roomId,
                participant,
                currentPage: rooms[roomId].currentPage,
                images: rooms[roomId].images,
                tasks: rooms[roomId].tasks
            });
        }

        io.to(roomId).emit('room-updated', {
            participants: rooms[roomId].participants,
            currentPage: rooms[roomId].currentPage,
            images: rooms[roomId].images,
            tasks: rooms[roomId].tasks
        });
    });

    socket.on('generate-page', ({ roomId, pageIndex }) => {
        if (!rooms[roomId]) return;
        console.log(`[AI] Manual generation triggered for room ${roomId}, page ${pageIndex}`);
        const { generatePersonalizedPage } = require('./leonardo');
        generatePersonalizedPage(roomId, pageIndex, io, rooms).catch(err => {
            console.error('[AI] Generation failed:', err.message);
            io.to(roomId).emit('ai-error', { message: 'שגיאת מערכת: ' + err.message, pageIndex });
        });
    });

    socket.on('change-page', ({ roomId, pageIndex }) => {
        if (!rooms[roomId]) return;
        rooms[roomId].currentPage = pageIndex;
        rooms[roomId].highlightedSegment = -1; // Reset highlight on page change
        socket.to(roomId).emit('page-changed', { currentPage: pageIndex });
        console.log(`Room ${roomId} -> page ${pageIndex}`);
    });

    socket.on('set-highlight', ({ roomId, pageIndex, segmentIndex }) => {
        if (!rooms[roomId]) return;
        rooms[roomId].highlightedSegment = segmentIndex;
        socket.to(roomId).emit('highlight-updated', { pageIndex, segmentIndex });
    });

    // --- Task Board Events ---
    socket.on('add-task', ({ roomId, text, author }) => {
        if (!rooms[roomId]) return;
        const task = {
            id: Date.now().toString(),
            text,
            author: author || 'אורן',
            completed: false
        };
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
            io.to(roomId).emit('tasks-updated', {
                tasks: rooms[roomId].tasks,
                completedTask: task.completed ? task.text : null
            });
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
        console.log(`[AI] Nano Banana Test triggered for room ${roomId}`);
        io.to(roomId).emit('ai-status', { message: 'מעלה תמונות משתתפים ל-Leonardo (PRO)...' });
        generateNanoTest(roomId, io, rooms).catch(err => {
            io.to(roomId).emit('ai-error', { message: 'שגיאת Leonardo: ' + err.message });
        });
    });

    socket.on('disconnect', () => {
        const roomId = socket.roomId;
        if (!roomId || !rooms[roomId]) return;

        rooms[roomId].participants = rooms[roomId].participants.filter(p => p.id !== socket.id);
        if (rooms[roomId].participants.length === 0) {
            delete rooms[roomId];
            console.log(`Room ${roomId} closed`);
        } else {
            io.to(roomId).emit('room-updated', {
                participants: rooms[roomId].participants,
                currentPage: rooms[roomId].currentPage
            });
        }
    });
});

const PORT = process.env.PORT || 3004;
server.listen(PORT, () => console.log(`[Haggadah] Ashkenaz version running -> http://localhost:${PORT}`));
