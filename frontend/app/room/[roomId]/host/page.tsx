'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { io, Socket } from 'socket.io-client';

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';
const TOTAL_SECTIONS = 19;

interface Participant { id: string; selfieUrl: string; joinedAt: number; }
interface Room { id: string; status: string; currentSectionIndex: number; participants: Participant[]; generatedImages: { id: string }[]; }
interface CostEstimate { participantCount: number; sceneCount: number; estimatedCostUSD: string; }

export default function HostPage() {
    const params = useParams();
    const searchParams = useSearchParams();
    const router = useRouter();
    const roomId = (params.roomId as string).toUpperCase();
    const hostId = searchParams.get('hostId') ?? '';

    const [room, setRoom] = useState<Room | null>(null);
    const [socket, setSocket] = useState<Socket | null>(null);
    const [estimate, setEstimate] = useState<CostEstimate | null>(null);
    const [generating, setGenerating] = useState(false);
    const [genProgress, setGenProgress] = useState({ completed: 0, total: 0 });
    const [shareUrl, setShareUrl] = useState('');
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            setShareUrl(`${window.location.origin}/join/${roomId}`);
        }
    }, [roomId]);

    // Firestore listener
    useEffect(() => {
        const unsub = onSnapshot(doc(db, 'rooms', roomId), (snap) => {
            if (snap.exists()) setRoom(snap.data() as Room);
        });
        return () => unsub();
    }, [roomId]);

    // Socket.io for host controls
    useEffect(() => {
        const s = io(BACKEND);
        s.emit('join-room', { roomId });
        s.on('generation-progress', (data: { completed: number; total: number }) => {
            setGenProgress(data);
        });
        setSocket(s);
        return () => { s.disconnect(); };
    }, [roomId]);

    // Fetch cost estimate when participants arrive
    useEffect(() => {
        if (!room || room.participants.length === 0) return;
        fetch(`${BACKEND}/api/scenes/estimate/${roomId}`)
            .then((r) => r.json())
            .then(setEstimate)
            .catch(() => { });
    }, [roomId, room?.participants.length]);

    const startSeder = useCallback(() => {
        socket?.emit('start-seder', { roomId });
        router.push(`/room/${roomId}/reader-host`);
    }, [socket, roomId, router]);

    const nextPage = useCallback(() => socket?.emit('next-page', { roomId }), [socket, roomId]);
    const prevPage = useCallback(() => socket?.emit('prev-page', { roomId }), [socket, roomId]);

    const finishSeder = useCallback(() => {
        socket?.emit('finish-seder', { roomId });
        router.push(`/room/${roomId}/gallery`);
    }, [socket, roomId, router]);

    const generateScenes = useCallback(async () => {
        setGenerating(true);
        setGenProgress({ completed: 0, total: 0 });
        await fetch(`${BACKEND}/api/scenes/generate/${roomId}`, { method: 'POST' });
    }, [roomId]);

    const copyLink = useCallback(async () => {
        await navigator.clipboard.writeText(shareUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }, [shareUrl]);

    const participants = room?.participants ?? [];
    const currentSection = room?.currentSectionIndex ?? 0;
    const isActive = room?.status === 'active';
    const genPct = genProgress.total > 0 ? (genProgress.completed / genProgress.total) * 100 : 0;

    return (
        <main style={{ minHeight: '100dvh', padding: '20px', maxWidth: 480, margin: '0 auto' }}>
            {/* Header */}
            <div style={{ textAlign: 'center', marginBottom: 28 }}>
                <div style={{ fontSize: '2.5rem' }}>👑</div>
                <h1 style={{ color: 'var(--gold)', fontSize: '1.5rem', fontWeight: 700 }}>Host Control Panel</h1>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Room: {roomId}</p>
            </div>

            {/* Share Link */}
            <div className="card" style={{ marginBottom: 16 }}>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: 8, fontWeight: 600 }}>📱 Share Link</p>
                <div style={{ display: 'flex', gap: 8 }}>
                    <div className="input" style={{ fontSize: '0.75rem', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {shareUrl}
                    </div>
                    <button className="btn btn-secondary btn-sm" onClick={copyLink} id="copy-link-btn">
                        {copied ? '✅' : '📋'}
                    </button>
                </div>
            </div>

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
                {[
                    { label: 'Participants', value: participants.length, icon: '👥' },
                    { label: 'Scenes', value: 23, icon: '🎨' },
                    { label: 'Images Ready', value: room?.generatedImages.length ?? 0, icon: '✅' },
                ].map(({ label, value, icon }) => (
                    <div key={label} className="card-gold" style={{ textAlign: 'center', padding: '14px 8px' }}>
                        <div style={{ fontSize: '1.4rem' }}>{icon}</div>
                        <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--gold)' }}>{value}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{label}</div>
                    </div>
                ))}
            </div>

            {/* Participants Grid */}
            {participants.length > 0 && (
                <div className="card" style={{ marginBottom: 16 }}>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: 10, fontWeight: 600 }}>👥 Participants</p>
                    <div className="participants-grid">
                        {participants.map((p) => (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img key={p.id} src={p.selfieUrl} alt="Participant" className="participant-avatar" />
                        ))}
                    </div>
                </div>
            )}

            {/* AI Generation */}
            <div className="card" style={{ marginBottom: 16 }}>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: 10, fontWeight: 600 }}>🎨 AI Scene Generation</p>
                {estimate && (
                    <div style={{ marginBottom: 12, padding: '10px 12px', background: 'rgba(212,168,71,0.06)', borderRadius: 'var(--radius)', border: '1px solid rgba(212,168,71,0.15)' }}>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            {estimate.participantCount} participants · {estimate.sceneCount} scenes
                        </p>
                        <p style={{ fontSize: '1.1rem', color: 'var(--gold)', fontWeight: 700 }}>
                            Est. cost: ${estimate.estimatedCostUSD}
                        </p>
                    </div>
                )}

                {generating && genProgress.total > 0 && (
                    <div style={{ marginBottom: 12 }}>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 6 }}>
                            Generating {genProgress.completed}/{genProgress.total} scenes…
                        </p>
                        <div className="progress-bar-outer">
                            <div className="progress-bar-inner" style={{ width: `${genPct}%` }} />
                        </div>
                    </div>
                )}

                <button
                    className="btn btn-primary btn-full"
                    onClick={generateScenes}
                    disabled={generating || participants.length === 0}
                    id="generate-scenes-btn"
                >
                    {generating ? `⚙️ Generating (${genProgress.completed}/${genProgress.total})` : '🎨 Generate Scenes'}
                </button>
                {participants.length === 0 && (
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: 8 }}>
                        Waiting for participants to join…
                    </p>
                )}
            </div>

            {/* Seder Controls */}
            <div className="card" style={{ marginBottom: 16 }}>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: 12, fontWeight: 600 }}>🎬 Seder Controls</p>

                {!isActive ? (
                    <button
                        className="btn btn-primary btn-full btn-lg animate-pulse-gold"
                        onClick={startSeder}
                        disabled={participants.length === 0}
                        id="start-seder-btn"
                    >
                        ▶ Start Seder
                    </button>
                ) : (
                    <>
                        <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: 12 }}>
                            Section {currentSection + 1} of {TOTAL_SECTIONS}
                        </p>
                        <div className="progress-bar-outer" style={{ marginBottom: 16 }}>
                            <div className="progress-bar-inner" style={{ width: `${((currentSection + 1) / TOTAL_SECTIONS) * 100}%` }} />
                        </div>
                        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                            <button className="btn btn-secondary" onClick={prevPage} style={{ flex: 1 }} id="prev-page-btn" disabled={currentSection === 0}>
                                ← Prev
                            </button>
                            <button className="btn btn-primary" onClick={nextPage} style={{ flex: 2 }} id="next-page-btn">
                                Next →
                            </button>
                        </div>
                        <button className="btn btn-danger btn-full btn-sm" onClick={finishSeder} id="finish-seder-btn">
                            🏁 Finish Seder
                        </button>
                    </>
                )}
            </div>

            {!isActive && participants.length === 0 && (
                <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                    Share the link above and wait for everyone to join!
                </p>
            )}
        </main>
    );
}
