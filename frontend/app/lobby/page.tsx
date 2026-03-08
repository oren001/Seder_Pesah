'use client';
import { useEffect, useState, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { io } from 'socket.io-client';

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

interface Participant { id: string; selfieUrl: string; }
interface GeneratedImage { id: string; sceneId: string; imageUrl: string; }
interface Room { status: string; participants: Participant[]; generatedImages: GeneratedImage[]; }
const LOBBY_SCENE_IDS = ['scene-lobby-redsea', 'scene-lobby-pyramids', 'scene-lobby-staff', 'scene-lobby-leaving'];

function LobbyContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const roomId = (searchParams.get('room') ?? '').toUpperCase();
    const [room, setRoom] = useState<Room | null>(null);
    const [socket, setSocket] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
    const [heroIndex, setHeroIndex] = useState(0);
    const [copied, setCopied] = useState(false);
    const participantId = typeof window !== 'undefined' ? sessionStorage.getItem(`participant_${roomId}`) : null;
    const isHostUser = typeof window !== 'undefined' ? sessionStorage.getItem(`isHost_${roomId}`) === 'true' : false;
    const joinUrl = typeof window !== 'undefined' ? `${window.location.origin}/join/?room=${roomId}` : '';

    const [estimate, setEstimate] = useState<{ participantCount: number; sceneCount: number; estimatedCostUSD: string } | null>(null);
    const [generating, setGenerating] = useState(false);
    const [genProgress, setGenProgress] = useState({ completed: 0, total: 0 });

    useEffect(() => {
        if (!roomId) return;
        let isSubscribed = true;

        fetch(`${BACKEND}/api/rooms/${roomId}`)
            .then(res => res.json())
            .then(data => {
                if (isSubscribed && data && !data.error) {
                    setRoom(data);
                    if (data.status === 'active') router.replace(`/reader/?room=${roomId}`);
                }
            })
            .catch(console.error);

        const s = io(BACKEND);
        setSocket(s);
        s.emit('join-room', { roomId });
        s.on('room-updated', ({ room }) => {
            if (!isSubscribed || !room) return;
            setRoom(room);
            if (room.status === 'active') router.replace(`/reader/?room=${roomId}`);
        });
        s.on('generation-progress', (d: { completed: number; total: number }) => {
            if (!isSubscribed) return;
            setGenProgress(d);
            if (d.completed >= d.total && d.total > 0) setGenerating(false);
        });

        return () => {
            isSubscribed = false;
            s.disconnect();
        };
    }, [roomId, router]);

    const heroImages = room?.generatedImages.filter(img => LOBBY_SCENE_IDS.includes(img.sceneId)) ?? [];
    useEffect(() => {
        if (heroImages.length < 2) return;
        const t = setInterval(() => setHeroIndex(i => (i + 1) % heroImages.length), 5000);
        return () => clearInterval(t);
    }, [heroImages.length]);

    const copy = useCallback(async () => { await navigator.clipboard.writeText(joinUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); }, [joinUrl]);
    const startSeder = useCallback(() => { socket?.emit('start-seder', { roomId }); }, [socket, roomId]);
    const generateScenes = useCallback(async () => { setGenerating(true); setGenProgress({ completed: 0, total: 0 }); await fetch(`${BACKEND}/api/scenes/generate/${roomId}`, { method: 'POST' }); }, [roomId]);

    useEffect(() => {
        if (!isHostUser || !room || room.participants.length === 0) return;
        fetch(`${BACKEND}/api/scenes/estimate/${roomId}`).then(r => r.json()).then(setEstimate).catch(() => { });
    }, [roomId, room?.participants.length, isHostUser]);

    const participants = room?.participants ?? [];
    const me = participants.find(p => p.id === participantId);

    return (
        <div style={{ width: '100%', maxWidth: 480, paddingBottom: 32 }}>
            {/* Hero */}
            <div style={{ width: '100%', height: '38dvh', borderRadius: 'var(--radius-xl)', overflow: 'hidden', marginBottom: 20, position: 'relative', boxShadow: 'var(--shadow)' }}>
                {heroImages.length > 0 ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={heroImages[heroIndex]?.id} src={heroImages[heroIndex]?.imageUrl} alt="סצנת יציאת מצרים" style={{ width: '100%', height: '100%', objectFit: 'cover', animation: 'fadeIn 1s ease' }} />
                ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10, background: 'rgba(253,251,247,0.7)', backdropFilter: 'blur(12px)' }}>
                        <div style={{ fontSize: '3rem' }}>🖼️</div>
                        {generating ? (
                            <p className="font-hebrew animate-shimmer" style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>מייצר תמונות AI...</p>
                        ) : (
                            <p className="font-hebrew" style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '0 20px' }}>
                                תמונות ההגדה יופיעו כאן לאחר שהמארח ייצר אותן.
                            </p>
                        )}
                    </div>
                )}
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 60, background: 'linear-gradient(transparent, var(--pearl))' }} />
            </div>

            <h1 className="font-hebrew" style={{ fontSize: '1.5rem', color: 'var(--gold-dark)', fontWeight: 900, marginBottom: 4, textAlign: 'center' }}>{isHostUser ? 'שלום למארח! 👑' : 'ממתינים לתחילת הסדר…'}</h1>
            {isHostUser ? (
                <div className="card-gold" style={{ textAlign: 'center', marginBottom: 18 }}>
                    <p className="font-hebrew" style={{ color: 'var(--gold-dark)', fontWeight: 700, fontSize: '0.9rem', marginBottom: 10 }}>כלי מארח</p>
                    <p className="font-hebrew" style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: 12 }}>המתינו שכל האורחים יצטרפו, ולאחר מכן ייצרו את תמונות ה-AI לכולם לפני שמתחילים.</p>

                    {estimate && !generating && (
                        <p className="font-hebrew" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 8 }}>
                            {estimate.participantCount} משתתפים · {estimate.sceneCount} תמונות · עלות משוערת: ${estimate.estimatedCostUSD}
                        </p>
                    )}

                    {generating && genProgress.total > 0 && (
                        <div style={{ marginBottom: 12 }}>
                            <p className="font-hebrew" style={{ fontSize: '0.75rem', color: 'var(--gold-dark)', marginBottom: 4 }}>מייצר {genProgress.completed}/{genProgress.total} סצנות…</p>
                            <div className="progress-bar-outer"><div className="progress-bar-inner" style={{ width: `${(genProgress.completed / genProgress.total) * 100}%` }} /></div>
                        </div>
                    )}

                    <button className="btn btn-secondary btn-full btn-sm" onClick={generateScenes} disabled={generating || participants.length === 0} style={{ marginBottom: 12 }}>
                        {generating ? '⚙️ מייצר תמונות...' : '🎨 ייצר את כל תמונות ה-AI כעת'}
                    </button>

                    <button className="btn btn-primary btn-full animate-pulse-gold" onClick={startSeder} disabled={participants.length === 0}>
                        ▶ התחל את הסדר לכולם!
                    </button>
                </div>
            ) : (
                <p className="font-hebrew" style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', marginBottom: 18 }}>המארח יתחיל ברגע שכולם מוכנים</p>
            )}

            {me && (
                <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={me.selfieUrl} alt="אתה" style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', border: '2.5px solid var(--gold)', flexShrink: 0 }} />
                    <p className="font-hebrew" style={{ color: 'var(--text-mid)', fontSize: '0.9rem' }}>כל הכבוד! אתם בפנים 🎉 ממתינים לסדר…</p>
                </div>
            )}

            <div className="card" style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <span className="font-hebrew" style={{ fontWeight: 600, color: 'var(--text-mid)' }}>משתתפים</span>
                    <span className="badge badge-gold">{participants.length} הצטרפו</span>
                </div>
                <div className="participants-grid">
                    {participants.map(p => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={p.id} src={p.selfieUrl} alt="משתתף" className="participant-avatar" style={p.id === participantId ? { border: '2.5px solid var(--gold)', boxShadow: 'var(--shadow-gold)' } : {}} />
                    ))}
                    {participants.length === 0 && <p className="font-hebrew" style={{ gridColumn: '1/-1', color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '16px 0' }}>עדיין אין משתתפים — שלחו את הקישור!</p>}
                </div>
            </div>

            <div className="card">
                <p className="font-hebrew" style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: 8 }}>📱 שתפו קישור:</p>
                <div style={{ display: 'flex', gap: 8 }}>
                    <div className="input" style={{ fontSize: '0.75rem', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', direction: 'ltr' }}>{joinUrl}</div>
                    <button className="btn btn-secondary btn-sm" onClick={copy} id="copy-link-btn">{copied ? '✅' : '📋'}</button>
                </div>
            </div>
        </div>
    );
}

export default function LobbyPage() {
    return <main className="page" style={{ justifyContent: 'flex-start', paddingTop: 20 }}><Suspense fallback={<div className="card" style={{ padding: 40, textAlign: 'center' }}><p>טוען…</p></div>}><LobbyContent /></Suspense></main>;
}
