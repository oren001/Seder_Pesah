const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;

// Emoji persistence (simple in-memory for the standalone version)
let emojiCounts = { '❤️': 0, '🍷': 0, '🎸': 0 };

// Snapshot Data (Pre-loaded for the new Memories URL)
const dataPath = path.join(__dirname, 'data.json');
let snapshotData = { participants: [], photos: [], videos: [], aiImages: [] };
if (fs.existsSync(dataPath)) {
    snapshotData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
}

app.get('/api/memories-data', (req, res) => {
    res.json({ ...snapshotData, emojiCounts });
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

io.on('connection', (socket) => {
    console.log('User connected to Memories Scrapbook');
    socket.on('memories-emoji', ({ emoji }) => {
        if (emojiCounts[emoji] !== undefined) {
            emojiCounts[emoji]++;
            io.emit('memories-emoji-update', { emoji, counts: emojiCounts });
        }
    });
});

server.listen(PORT, () => {
    console.log(`Memories Scrapbook running at http://localhost:${PORT}`);
});
