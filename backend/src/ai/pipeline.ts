import { v4 as uuidv4 } from 'uuid';
import { Server } from 'socket.io';
import type { Room, GeneratedImage } from '../../../shared-types';
import { scenes, lobbySceneIds } from '../haggadah/scenes';
import { addGeneratedImage } from '../rooms';

// Use Leonardo Vision XL (Supported on current API tier)
const LEONARDO_PHOENIX_MODEL_ID = '2067ae52-33fd-4a82-bb92-c2c55e7d2786';
const LEONARDO_API_URL = 'https://cloud.leonardo.ai/api/rest/v1';
const LEONARDO_API_KEY = process.env.LEONARDO_API_KEY!;

// Cost estimate: Leonardo Phoenix ~$0.02/image at 1024x1024 (1 generation credit ≈ $0.012)
const COST_PER_IMAGE = 0.02;

export function estimateCost(participantCount: number, sceneCount: number): number {
    const lobbyImages = Math.min(participantCount, 4) * lobbySceneIds.length;
    const total = sceneCount + lobbyImages;
    return total * COST_PER_IMAGE;
}

function buildPrompt(template: string, participants: Room['participants'], slotCount: number): string {
    return template
        .replace('{participant_count}', String(Math.min(participants.length, slotCount)))
        .replace('{participants}', participants.slice(0, slotCount).map((_, i) => `Person ${i + 1}`).join(', '));
}

async function pollForImage(generationId: string): Promise<string | null> {
    const maxAttempts = 30;
    for (let i = 0; i < maxAttempts; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const res = await fetch(`${LEONARDO_API_URL}/generations/${generationId}`, {
            headers: { Authorization: `Bearer ${LEONARDO_API_KEY}`, 'Content-Type': 'application/json' },
        });
        const data = (await res.json()) as {
            generations_by_pk?: { status: string; generated_images?: { url: string }[] };
        };
        const gen = data.generations_by_pk;
        if (gen?.status === 'COMPLETE' && gen.generated_images && gen.generated_images.length > 0) {
            return gen.generated_images[0].url;
        }
        if (gen?.status === 'FAILED') return null;
    }
    return null;
}

async function generateOneImage(prompt: string): Promise<string> {
    // Submit generation
    const res = await fetch(`${LEONARDO_API_URL}/generations`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${LEONARDO_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            modelId: LEONARDO_PHOENIX_MODEL_ID,
            prompt,
            num_images: 1,
            width: 1024,
            height: 1024,
            // Phoenix-specific: ultra quality
            ultra: true,
            presetStyle: 'ILLUSTRATION',
            alchemy: true,
        }),
    });

    // Read raw response instead of blindly casting
    const rawText = await res.text();
    let data;
    try {
        data = JSON.parse(rawText);
    } catch {
        throw new Error(`Invalid JSON from Leonardo: ${rawText.substring(0, 100)}`);
    }

    const generationId = data.sdGenerationJob?.generationId;
    if (!generationId) {
        console.error('Leonardo generation error response:', data);
        throw new Error('No generationId from Leonardo. Details logged.');
    }

    // Poll until done
    const imageUrl = await pollForImage(generationId);
    if (!imageUrl) throw new Error('Generation failed or timed out');
    return imageUrl;
}

export async function generateScenes(room: Room, io: Server): Promise<void> {
    const allScenes = scenes;
    let completed = 0;
    io.to(room.id).emit('generation-progress', { completed: 0, total: allScenes.length });

    for (const scene of allScenes) {
        try {
            const prompt = buildPrompt(scene.promptTemplate, room.participants, scene.participantSlots);
            const imageUrl = await generateOneImage(prompt);

            const genImage: GeneratedImage = {
                id: uuidv4(),
                sceneId: scene.id,
                sectionId: scene.sectionId,
                imageUrl,
                participantIds: room.participants.slice(0, scene.participantSlots).map((p) => p.id),
                generatedAt: Date.now(),
            };
            await addGeneratedImage(room.id, genImage);
            const updatedRoom = await import('../rooms').then(m => m.getRoom(room.id));
            io.to(room.id).emit('new-image', { image: genImage });
            if (updatedRoom) {
                io.to(room.id).emit('room-updated', { room: updatedRoom });
            }
        } catch (err) {
            console.error(`Failed to generate scene ${scene.id}:`, err);
        }
        completed++;
        io.to(room.id).emit('generation-progress', { completed, total: allScenes.length });
        // Small delay between requests
        await new Promise((r) => setTimeout(r, 300));
    }
    console.log(`✅ Leonardo Phoenix generated ${completed}/${allScenes.length} scenes for room ${room.id}`);
}

export async function generateSingleScene(
    room: Room, sceneId: string, io: Server, overrideParticipantIds?: string[]
): Promise<GeneratedImage | null> {
    const scene = scenes.find((s) => s.id === sceneId);
    if (!scene) return null;
    const featured = overrideParticipantIds
        ? room.participants.filter((p) => overrideParticipantIds.includes(p.id))
        : room.participants;
    try {
        const prompt = buildPrompt(scene.promptTemplate, featured, scene.participantSlots);
        const imageUrl = await generateOneImage(prompt);
        const genImage: GeneratedImage = {
            id: uuidv4(), sceneId: scene.id, sectionId: scene.sectionId, imageUrl,
            participantIds: featured.slice(0, scene.participantSlots).map((p) => p.id),
            generatedAt: Date.now(),
        };
        addGeneratedImage(room.id, genImage);
        io.to(room.id).emit('new-image', { image: genImage });
        return genImage;
    } catch (err) {
        console.error(`Failed single scene ${sceneId}:`, err);
        return null;
    }
}
