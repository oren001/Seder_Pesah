import { db } from './firebase';
import { v4 as uuidv4 } from 'uuid';
import type { Room, Participant, GeneratedImage, Vote } from '../../shared-types';

const ROOMS = 'rooms';

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
    await db.collection(ROOMS).doc(id).set(room);
    return room;
}

export async function getRoom(id: string): Promise<Room | null> {
    const doc = await db.collection(ROOMS).doc(id.toUpperCase()).get();
    if (!doc.exists) return null;
    return doc.data() as Room;
}

export async function updateRoomStatus(roomId: string, status: Room['status']): Promise<void> {
    await db.collection(ROOMS).doc(roomId.toUpperCase()).update({ status });
}

export async function setCurrentSection(roomId: string, index: number): Promise<void> {
    await db.collection(ROOMS).doc(roomId.toUpperCase()).update({ currentSectionIndex: index });
}

// --- Participants ---

export async function addParticipant(roomId: string, selfieUrl: string): Promise<Participant | null> {
    const roomRef = db.collection(ROOMS).doc(roomId.toUpperCase());
    const doc = await roomRef.get();
    if (!doc.exists) return null;

    const participant: Participant = {
        id: uuidv4(),
        roomId: roomId.toUpperCase(),
        selfieUrl,
        joinedAt: Date.now(),
    };

    const room = doc.data() as Room;
    const participants = [...(room.participants || []), participant];
    await roomRef.update({ participants });
    return participant;
}

// --- Generated Images ---

export async function addGeneratedImage(roomId: string, image: GeneratedImage): Promise<void> {
    const roomRef = db.collection(ROOMS).doc(roomId.toUpperCase());
    const doc = await roomRef.get();
    if (!doc.exists) return;
    const room = doc.data() as Room;
    const generatedImages = [...(room.generatedImages || []), image];
    await roomRef.update({ generatedImages });
}

// --- Votes ---

export async function addVote(roomId: string, vote: Vote): Promise<void> {
    const roomRef = db.collection(ROOMS).doc(roomId.toUpperCase());
    const doc = await roomRef.get();
    if (!doc.exists) return;
    const room = doc.data() as Room;
    const votes = [...(room.votes || []), vote];
    await roomRef.update({ votes });
}

export async function updateVote(roomId: string, vote: Vote): Promise<void> {
    const roomRef = db.collection(ROOMS).doc(roomId.toUpperCase());
    const doc = await roomRef.get();
    if (!doc.exists) return;
    const room = doc.data() as Room;
    const votes = (room.votes || []).map((v) => (v.id === vote.id ? vote : v));
    await roomRef.update({ votes });
}

export async function getVote(roomId: string, voteId: string): Promise<Vote | null> {
    const room = await getRoom(roomId);
    return room?.votes.find((v) => v.id === voteId) ?? null;
}
