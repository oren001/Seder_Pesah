import { Router } from 'express';
import { Server } from 'socket.io';
import { getRoom } from '../rooms';
import { generateScenes, estimateCost } from '../ai/pipeline';
import { scenes } from '../haggadah/scenes';

export function scenesRouter(io: Server) {
    const router = Router();

    // GET /api/scenes/estimate/:roomId - Estimate generation cost
    router.get('/estimate/:roomId', (req, res) => {
        const room = getRoom(req.params.roomId);
        if (!room) return res.status(404).json({ error: 'Room not found' });
        const participantCount = room.participants.length;
        const sceneCount = scenes.length;
        const estimate = estimateCost(participantCount, sceneCount);
        return res.json({
            participantCount,
            sceneCount,
            estimatedCostUSD: estimate.toFixed(2),
            estimatedImages: sceneCount,
        });
    });

    // POST /api/scenes/generate/:roomId - Kick off AI scene generation
    router.post('/generate/:roomId', async (req, res) => {
        const room = getRoom(req.params.roomId);
        if (!room) return res.status(404).json({ error: 'Room not found' });
        if (room.participants.length === 0) {
            return res.status(400).json({ error: 'No participants in room' });
        }

        // Return immediately; generation is async
        res.json({ status: 'generation_started', sceneCount: scenes.length });

        // Fire async generation pipeline
        generateScenes(room, io).catch((err) => {
            console.error('Scene generation error:', err);
        });
    });

    // GET /api/scenes/images/:roomId - Get all generated images for a room
    router.get('/images/:roomId', (req, res) => {
        const room = getRoom(req.params.roomId);
        if (!room) return res.status(404).json({ error: 'Room not found' });
        return res.json({ images: room.generatedImages });
    });

    return router;
}
