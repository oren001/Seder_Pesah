const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { generateAllImages } = require('./leonardo');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));

// In-memory room state
const rooms = {};

function generateId() {
    return Math.random().toString(36).substring(2, 8);
}

io.on('connection', (socket) => {
    console.log(`+ Connected: ${socket.id}`);

    socket.on('create-room', (callback) => {
        const roomId = generateId();
        rooms[roomId] = {
            id: roomId,
            currentPage: 0,
            participants: [],
            images: {} // Cache for AI images
        };
        console.log(`Room created: ${roomId}`);

        // Start AI generation in background
        generateAllImages(roomId, io, rooms);

        callback({ roomId });
    });

    socket.on('join-room', (data, callback) => {
        const { roomId, photo } = typeof data === 'object' ? data : { roomId: data, photo: null };

        if (!rooms[roomId]) {
            rooms[roomId] = { id: roomId, currentPage: 0, participants: [], images: {} };
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
            images: rooms[roomId].images
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
