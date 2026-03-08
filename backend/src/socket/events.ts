import { Server, Socket } from 'socket.io';
import {
    getRoom,
    setCurrentSection,
    updateRoomStatus,
    addVote,
    updateVote,
    getVote,
} from '../rooms';
import { haggadahSections } from '../haggadah/sections';
import { v4 as uuidv4 } from 'uuid';
import type { Vote, VoteChoice } from '../../../shared-types';

export function registerSocketHandlers(io: Server) {
    io.on('connection', (socket: Socket) => {
        console.log(`Socket connected: ${socket.id}`);

        // Participant / host joins the socket room
        socket.on('join-room', ({ roomId }: { roomId: string }) => {
            socket.join(roomId);
            const room = getRoom(roomId);
            if (room) {
                socket.emit('room-updated', { room });
            }
            console.log(`Socket ${socket.id} joined room ${roomId}`);
        });

        // Host starts the seder
        socket.on('start-seder', ({ roomId }: { roomId: string }) => {
            updateRoomStatus(roomId, 'active');
            const room = getRoom(roomId);
            io.to(roomId).emit('seder-started', {});
            io.to(roomId).emit('room-updated', { room });
            console.log(`Seder started in room ${roomId}`);
        });

        // Host moves to next page
        socket.on('next-page', ({ roomId }: { roomId: string }) => {
            const room = getRoom(roomId);
            if (!room) return;
            const newIndex = Math.min(
                room.currentSectionIndex + 1,
                haggadahSections.length - 1
            );
            setCurrentSection(roomId, newIndex);
            io.to(roomId).emit('page-changed', { sectionIndex: newIndex });
        });

        // Host moves to previous page
        socket.on('prev-page', ({ roomId }: { roomId: string }) => {
            const room = getRoom(roomId);
            if (!room) return;
            const newIndex = Math.max(room.currentSectionIndex - 1, 0);
            setCurrentSection(roomId, newIndex);
            io.to(roomId).emit('page-changed', { sectionIndex: newIndex });
        });

        // Host finishes the seder
        socket.on('finish-seder', ({ roomId }: { roomId: string }) => {
            updateRoomStatus(roomId, 'finished');
            const room = getRoom(roomId);
            io.to(roomId).emit('seder-finished', {});
            io.to(roomId).emit('room-updated', { room });
        });

        // Host opens a vote
        socket.on(
            'open-vote',
            ({
                roomId,
                question,
                participantIds,
                labels,
            }: {
                roomId: string;
                question: string;
                participantIds: string[];
                labels: string[];
            }) => {
                const room = getRoom(roomId);
                if (!room) return;
                const choices: VoteChoice[] = participantIds.map((pid, i) => ({
                    participantId: pid,
                    label: labels[i] || pid,
                    votes: [],
                }));
                const vote: Vote = {
                    id: uuidv4(),
                    question,
                    choices,
                    status: 'open',
                };
                addVote(roomId, vote);
                io.to(roomId).emit('vote-opened', { vote });
            }
        );

        // Participant casts a vote
        socket.on(
            'cast-vote',
            ({
                roomId,
                voteId,
                participantId,
                choiceParticipantId,
            }: {
                roomId: string;
                voteId: string;
                participantId: string;
                choiceParticipantId: string;
            }) => {
                const vote = getVote(roomId, voteId);
                if (!vote || vote.status !== 'open') return;
                // Remove previous vote from this participant
                vote.choices.forEach((c) => {
                    c.votes = c.votes.filter((v) => v !== participantId);
                });
                // Add new vote
                const choice = vote.choices.find((c) => c.participantId === choiceParticipantId);
                if (choice) choice.votes.push(participantId);
                updateVote(roomId, vote);
                io.to(roomId).emit('vote-updated', { vote });
            }
        );

        // Host closes a vote and broadcasts result
        socket.on('close-vote', ({ roomId, voteId }: { roomId: string; voteId: string }) => {
            const vote = getVote(roomId, voteId);
            if (!vote) return;
            vote.status = 'closed';
            // Determine winner
            const winner = vote.choices.reduce((a, b) =>
                a.votes.length >= b.votes.length ? a : b
            );
            vote.winnerId = winner.participantId;
            vote.winnerName = winner.label;
            updateVote(roomId, vote);
            io.to(roomId).emit('vote-closed', { vote });
        });

        socket.on('disconnect', () => {
            console.log(`Socket disconnected: ${socket.id}`);
        });
    });
}
