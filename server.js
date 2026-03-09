const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { generateAllImages, generateNanoTest } = require('./leonardo');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));

// In-memory room state
const rooms = {};

function generateId() {
    return Math.random().toString(36).substring(2, 8);
}

const fs = require('fs');
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

    socket.on('create-room', (callback) => {
        const roomId = generateId();
        rooms[roomId] = {
            id: roomId,
            currentPage: 0,
            participants: [],
            images: {}, // Cache for AI images
            tasks: persistedTasks[roomId] || [] // Synchronized task board
        };
        console.log(`Room created: ${roomId}`);

        // Start AI generation for first page (Kadesh) ONLY
        const { generateImage } = require('./leonardo');
        const kadeshPrompt = require('./leonardo').HAGGADAH_PROMPTS[0].prompt;

        generateImage(kadeshPrompt).then(imageUrl => {
            if (imageUrl && rooms[roomId]) {
                rooms[roomId].images[0] = imageUrl;
                io.to(roomId).emit('image-ready', { pageIndex: 0, imageUrl });
            }
        }).catch(err => console.error('[AI] Kadesh generation failed:', err.message));

        callback({ roomId });
    });

    socket.on('join-room', (data, callback) => {
        const { roomId, photo } = typeof data === 'object' ? data : { roomId: data, photo: null };

        if (!rooms[roomId]) {
            rooms[roomId] = {
                id: roomId,
                currentPage: 0,
                participants: [],
                images: {},
                tasks: persistedTasks[roomId] || []
            };
        }

        socket.join(roomId);
        socket.roomId = roomId;

        const participant = { id: socket.id, photo: photo || null };
        rooms[roomId].participants.push(participant);

        console.log(`User ${socket.id} joined room ${roomId}`);

        callback({
            success: true,
            roomId,
            participant,
            currentPage: rooms[roomId].currentPage,
            images: rooms[roomId].images,
            tasks: rooms[roomId].tasks
        });

        io.to(roomId).emit('room-updated', {
            participants: rooms[roomId].participants,
            currentPage: rooms[roomId].currentPage
        });
    });

    socket.on('change-page', ({ roomId, pageIndex }) => {
        if (!rooms[roomId]) return;
        rooms[roomId].currentPage = pageIndex;
        socket.to(roomId).emit('page-changed', { currentPage: pageIndex });
        console.log(`Room ${roomId} -> page ${pageIndex}`);
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
        io.to(roomId).emit('tasks-updated', rooms[roomId].tasks);
    });

    socket.on('toggle-task', ({ roomId, taskId }) => {
        if (!rooms[roomId]) return;
        const task = rooms[roomId].tasks.find(t => t.id === taskId);
        if (task) {
            task.completed = !task.completed;
            saveTasks(roomId, rooms[roomId].tasks);
            io.to(roomId).emit('tasks-updated', rooms[roomId].tasks);
        }
    });

    socket.on('delete-task', ({ roomId, taskId }) => {
        if (!rooms[roomId]) return;
        rooms[roomId].tasks = rooms[roomId].tasks.filter(t => t.id !== taskId);
        saveTasks(roomId, rooms[roomId].tasks);
        io.to(roomId).emit('tasks-updated', rooms[roomId].tasks);
    });

    socket.on('test-nano-banana', ({ roomId, photo }) => {
        if (!rooms[roomId] || !photo) return;
        console.log(`[AI] Nano Banana Test triggered for room ${roomId}`);
        io.to(roomId).emit('ai-status', { message: 'מעלה תמונה ל-Leonardo...' });
        generateNanoTest(roomId, photo, io, rooms).catch(err => {
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
