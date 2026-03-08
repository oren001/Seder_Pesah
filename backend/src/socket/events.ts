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
        socket.on('join-room', async ({ roomId }: { roomId: string }) => {
            socket.join(roomId);
            const room = await getRoom(roomId);
            if (room) {
                socket.emit('room-updated', { room });
            }
            console.log(`Socket ${socket.id} joined room ${roomId}`);
        });

        // Host starts the seder
        socket.on('start-seder', async ({ roomId }: { roomId: string }) => {
            await updateRoomStatus(roomId, 'active');
            const room = await getRoom(roomId);
            io.to(roomId).emit('seder-started', {});
            io.to(roomId).emit('room-updated', { room });
            console.log(`Seder started in room ${roomId}`);
        });

        // Host moves to next page
        socket.on('next-page', async ({ roomId }: { roomId: string }) => {
            const room = await getRoom(roomId);
            if (!room) return;
            const newIndex = Math.min(
                room.currentSectionIndex + 1,
                haggadahSections.length - 1
            );
            await setCurrentSection(roomId, newIndex);
            const updatedRoom = await getRoom(roomId);
            io.to(roomId).emit('page-changed', { sectionIndex: newIndex });
            io.to(roomId).emit('room-updated', { room: updatedRoom });
        });

        // Host moves to previous page
        socket.on('prev-page', async ({ roomId }: { roomId: string }) => {
            const room = await getRoom(roomId);
            if (!room) return;
            const newIndex = Math.max(room.currentSectionIndex - 1, 0);
            await setCurrentSection(roomId, newIndex);
            const updatedRoom = await getRoom(roomId);
            io.to(roomId).emit('page-changed', { sectionIndex: newIndex });
            io.to(roomId).emit('room-updated', { room: updatedRoom });
        });

        // Host finishes the seder
        socket.on('finish-seder', async ({ roomId }: { roomId: string }) => {
            await updateRoomStatus(roomId, 'finished');
            const room = await getRoom(roomId);
            io.to(roomId).emit('seder-finished', {});
            io.to(roomId).emit('room-updated', { room });
        });

        // Host opens a vote
        socket.on(
            'open-vote',
            async ({
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
                const room = await getRoom(roomId);
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
                await addVote(roomId, vote);
                io.to(roomId).emit('vote-opened', { vote });
            }
        );

        // Participant casts a vote
        socket.on(
            'cast-vote',
            async ({
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
                const vote = await getVote(roomId, voteId);
                if (!vote || vote.status !== 'open') return;
                // Remove previous vote from this participant
                vote.choices.forEach((c) => {
                    c.votes = c.votes.filter((v: string) => v !== participantId);
                });
                // Add new vote
                const choice = vote.choices.find((c) => c.participantId === choiceParticipantId);
                if (choice) choice.votes.push(participantId);
                await updateVote(roomId, vote);
                io.to(roomId).emit('vote-updated', { vote });
            }
        );

        // Host closes a vote and broadcasts result
        socket.on('close-vote', async ({ roomId, voteId }: { roomId: string; voteId: string }) => {
            const vote = await getVote(roomId, voteId);
            if (!vote) return;
            vote.status = 'closed';
            // Determine winner
            const winner = vote.choices.reduce((a: VoteChoice, b: VoteChoice) =>
                a.votes.length >= b.votes.length ? a : b
            );
            vote.winnerId = winner.participantId;
            vote.winnerName = winner.label;
            await updateVote(roomId, vote);
            io.to(roomId).emit('vote-closed', { vote });
        });

        socket.on('disconnect', () => {
            console.log(`Socket disconnected: ${socket.id}`);
        });
    });
}
