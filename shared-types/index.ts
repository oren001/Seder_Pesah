export interface Participant {
    id: string;
    roomId: string;
    selfieUrl: string; // base64 data URL or cloud URL
    joinedAt: number;
}

export interface Room {
    id: string;
    hostId: string;
    createdAt: number;
    status: 'lobby' | 'active' | 'finished';
    currentSectionIndex: number;
    participants: Participant[];
    generatedImages: GeneratedImage[];
    votes: Vote[];
}

export interface HaggadahSection {
    id: string;
    order: number;
    title: string;
    titleHebrew: string;
    hebrew: string;
    transliteration?: string;
    english: string;
    sceneIds: string[];
    hasVote?: boolean;
    voteQuestion?: string;
    voteChoices?: string[];
    hasScratch?: boolean;
    scratchReveal?: string;
}

export interface Scene {
    id: string;
    sectionId: string;
    promptTemplate: string;
    style: string;
    participantSlots: number; // how many participants to feature
}

export interface GeneratedImage {
    id: string;
    sceneId: string;
    sectionId: string;
    imageUrl: string;
    participantIds: string[];
    generatedAt: number;
}

export interface Vote {
    id: string;
    question: string;
    choices: VoteChoice[];
    status: 'open' | 'closed';
    winnerId?: string;
    winnerName?: string;
}

export interface VoteChoice {
    participantId: string;
    label: string;
    votes: string[]; // participant IDs who voted for this
}

// Socket event payloads
export interface SocketEvents {
    // Client → Server
    'join-room': { roomId: string; participantId: string };
    'next-page': { roomId: string };
    'prev-page': { roomId: string };
    'start-seder': { roomId: string };
    'finish-seder': { roomId: string };
    'cast-vote': { roomId: string; voteId: string; participantId: string; choiceId: string };
    'open-vote': { roomId: string; voteId: string };
    'close-vote': { roomId: string; voteId: string };

    // Server → Client
    'room-updated': { room: Room };
    'page-changed': { sectionIndex: number };
    'seder-started': void;
    'seder-finished': void;
    'vote-opened': { vote: Vote };
    'vote-updated': { vote: Vote };
    'vote-closed': { vote: Vote };
    'new-image': { image: GeneratedImage };
    'generation-progress': { completed: number; total: number };
}
