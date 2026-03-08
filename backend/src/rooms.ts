import { v4 as uuidv4 } from 'uuid';
import type { Room, Participant, GeneratedImage, Vote } from '../../shared-types';
import * as fs from 'fs';
import * as path from 'path';

// Local database file path
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'rooms.json');

// In-memory store
const roomsStore: Map<string, Room> = new Map();

// Initialize the database
function initDb() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DB_FILE)) {
        try {
            const data = fs.readFileSync(DB_FILE, 'utf-8');
            const parsed = JSON.parse(data) as Record<string, Room>;
            for (const [key, value] of Object.entries(parsed)) {
                roomsStore.set(key, value);
            }
            console.log(`🗄️ Loaded ${roomsStore.size} rooms from local database`);
        } catch (err) {
            console.error('❌ Failed to parse rooms.json:', err);
        }
    } else {
        console.log('🗄️ No existing local database found, starting fresh');
    }
}

// Persist to disk
async function saveDb() {
    try {
        const obj = Object.fromEntries(roomsStore);
        await fs.promises.writeFile(DB_FILE, JSON.stringify(obj, null, 2), 'utf-8');
    } catch (err) {
        console.error('❌ Failed to save to local database:', err);
    }
}

// Initialize on load
initDb();

// --- Room CRUD ---

export async function createRoom(hostId: string): Promise<Room> {
    const id = uuidv4().slice(0, 8).toUpperCase();
    const room: Room = {
        id,
        hostId,
        createdAt: Date.now(),
        status: 'lobby',
        currentSectionIndex: 0,
        participants: [],
        generatedImages: [],
        votes: [],
    };
    try {
        roomsStore.set(id, room);
        await saveDb();
        console.log(`🏠 Room created successfully: ${id}`);
        return room;
    } catch (err) {
        console.error(`❌ Error creating room locally:`, err);
        throw err;
    }
}

export async function getRoom(id: string): Promise<Room | null> {
    return roomsStore.get(id.toUpperCase()) || null;
}

export async function updateRoomStatus(roomId: string, status: Room['status']): Promise<void> {
    const room = roomsStore.get(roomId.toUpperCase());
    if (room) {
        room.status = status;
        await saveDb();
    }
}

export async function setCurrentSection(roomId: string, index: number): Promise<void> {
    const room = roomsStore.get(roomId.toUpperCase());
    if (room) {
        room.currentSectionIndex = index;
        await saveDb();
    }
}

// --- Participants ---

export async function addParticipant(roomId: string, selfieUrl: string): Promise<Participant | null> {
    const room = roomsStore.get(roomId.toUpperCase());
    if (!room) return null;

    const participant: Participant = {
        id: uuidv4(),
        roomId: roomId.toUpperCase(),
        selfieUrl,
        joinedAt: Date.now(),
    };

    room.participants = [...(room.participants || []), participant];
    await saveDb();
    return participant;
}

// --- Generated Images ---

export async function addGeneratedImage(roomId: string, image: GeneratedImage): Promise<void> {
    const room = roomsStore.get(roomId.toUpperCase());
    if (!room) return;
    room.generatedImages = [...(room.generatedImages || []), image];
    await saveDb();
}

// --- Votes ---

export async function addVote(roomId: string, vote: Vote): Promise<void> {
    const room = roomsStore.get(roomId.toUpperCase());
    if (!room) return;
    room.votes = [...(room.votes || []), vote];
    await saveDb();
}

export async function updateVote(roomId: string, vote: Vote): Promise<void> {
    const room = roomsStore.get(roomId.toUpperCase());
    if (!room) return;
    room.votes = (room.votes || []).map((v) => (v.id === vote.id ? vote : v));
    await saveDb();
}

export async function getVote(roomId: string, voteId: string): Promise<Vote | null> {
    const room = await getRoom(roomId);
    return room?.votes.find((v) => v.id === voteId) ?? null;
}
