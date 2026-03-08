import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { createRoom, getRoom, addParticipant } from '../rooms';

export const roomsRouter = Router();

// POST /api/rooms - Create a new Seder room
roomsRouter.post('/', async (req, res) => {
    const hostId = uuidv4();
    const room = await createRoom(hostId);
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.json({
        room,
        hostId,
        joinUrl: `${baseUrl}/join/?room=${room.id}`,
        hostUrl: `${baseUrl}/host/?room=${room.id}&hostId=${hostId}`,
    });
});

// GET /api/rooms/:id - Get room state
roomsRouter.get('/:id', async (req, res) => {
    const room = await getRoom(req.params.id);
    if (!room) return res.status(404).json({ error: 'Room not found' });
    return res.json(room);
});

// POST /api/rooms/:id/join - Participant joins with selfie
roomsRouter.post('/:id/join', async (req, res) => {
    const { selfieDataUrl } = req.body as { selfieDataUrl: string };
    if (!selfieDataUrl) return res.status(400).json({ error: 'selfieDataUrl is required' });

    const participant = await addParticipant(req.params.id, selfieDataUrl);
    if (!participant) return res.status(404).json({ error: 'Room not found' });

    return res.json({ participant });
});

// GET /api/rooms - List all rooms (host debug only)
roomsRouter.get('/', (_req, res) => {
    res.json({ count: 0, rooms: [] }); // hidden for security in prod
});
