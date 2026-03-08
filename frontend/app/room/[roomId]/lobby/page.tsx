'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

const HERO_SCENE_IDS = [
    'scene-lobby-redsea',
    'scene-lobby-pyramids',
    'scene-lobby-staff',
    'scene-lobby-leaving',
];

interface Participant { id: string; selfieUrl: string; joinedAt: number; }
interface GeneratedImage { id: string; sceneId: string; imageUrl: string; }
interface Room {
    id: string; status: string; currentSectionIndex: number;
    participants: Participant[]; generatedImages: GeneratedImage[];
}

export default function LobbyPage() {
    const params = useParams();
    const router = useRouter();
    const roomId = (params.roomId as string).toUpperCase();

    const [room, setRoom] = useState<Room | null>(null);
    const [heroIndex, setHeroIndex] = useState(0);

    const participantId = typeof window !== 'undefined' ? sessionStorage.getItem(`participant_${roomId}`) : null;

    // Listen to Firestore room in real-time
    useEffect(() => {
        const unsub = onSnapshot(doc(db, 'rooms', roomId), (snap) => {
            if (!snap.exists()) return;
            const data = snap.data() as Room;
            setRoom(data);
            if (data.status === 'active') {
                router.replace(`/room/${roomId}/reader`);
            }
        });
        return () => unsub();
    }, [roomId, router]);

    // Rotate hero images every 5s
    const heroImages = room?.generatedImages.filter((img) => HERO_SCENE_IDS.includes(img.sceneId)) ?? [];
    useEffect(() => {
        if (heroImages.length < 2) return;
        const t = setInterval(() => setHeroIndex((i) => (i + 1) % heroImages.length), 5000);
        return () => clearInterval(t);
    }, [heroImages.length]);

    const participants = room?.participants ?? [];
    const myParticipant = participants.find((p) => p.id === participantId);

    return (
        <main style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
            {/* Hero Slideshow */}
            <div style={{ position: 'relative', width: '100%', height: '40dvh', overflow: 'hidden', flexShrink: 0 }}>
                {heroImages.length > 0 ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                        key={heroImages[heroIndex]?.id}
                        src={heroImages[heroIndex]?.imageUrl}
                        alt="Exodus scene"
                        style={{ width: '100%', height: '100%', objectFit: 'cover', animation: 'fadeIn 1s ease' }}
                    />
                ) : (
                    <div style={{
                        width: '100%', height: '100%',
                        background: 'linear-gradient(180deg, var(--navy-mid) 0%, var(--navy-light) 100%)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12,
                    }}>
                        <div style={{ fontSize: '4rem' }}>🌊</div>
                        <p className="shimmer" style={{ color: 'var(--gold-light)', fontSize: '0.85rem', padding: '6px 16px', borderRadius: 50 }}>
                            Generating Exodus scenes…
                        </p>
                    </div>
                )}
                {/* Bottom fade */}
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 80, background: 'linear-gradient(transparent, var(--navy))' }} />
            </div>

            {/* Content */}
            <div className="container" style={{ flex: 1, paddingTop: 8, paddingBottom: 32 }}>
                <h1 className="font-hebrew" style={{ textAlign: 'center', fontSize: '1.6rem', color: 'var(--gold)', marginBottom: 4 }}>
                    ממתינים לתחילת הסדר...
                </h1>
                <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 20 }}>
                    The host will start when everyone is ready
                </p>

                {/* Current user highlight */}
                {myParticipant && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, padding: '10px 14px', borderRadius: 'var(--radius)', background: 'rgba(212,168,71,0.08)', border: '1px solid rgba(212,168,71,0.2)' }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={myParticipant.selfieUrl} alt="You" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--gold)' }} />
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>You&apos;re in! 🎉 Waiting for the Seder to begin…</span>
                    </div>
                )}

                {/* Participants grid */}
                <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: 600 }}>
                        Participants
                    </p>
                    <span className="badge badge-gold">{participants.length} joined</span>
                </div>

                <div className="participants-grid" style={{ marginBottom: 24 }}>
                    {participants.map((p) => (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                            key={p.id}
                            src={p.selfieUrl}
                            alt="Participant"
                            className="participant-avatar"
                            style={p.id === participantId ? { border: '2px solid var(--gold)', boxShadow: 'var(--shadow-gold)' } : {}}
                        />
                    ))}
                    {participants.length === 0 && (
                        <p style={{ gridColumn: '1/-1', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', padding: '20px 0' }}>
                            No one else yet — share the link!
                        </p>
                    )}
                </div>

                {/* Share link */}
                <ShareLink roomId={roomId} />
            </div>
        </main>
    );
}

function ShareLink({ roomId }: { roomId: string }) {
    const [copied, setCopied] = useState(false);
    const joinUrl = typeof window !== 'undefined' ? `${window.location.origin}/join/${roomId}` : '';

    const copy = useCallback(async () => {
        await navigator.clipboard.writeText(joinUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }, [joinUrl]);

    return (
        <div className="card" style={{ textAlign: 'center' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: 8 }}>Invite others — share this link:</p>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div className="input" style={{ fontSize: '0.8rem', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'default' }}>
                    {joinUrl}
                </div>
                <button className="btn btn-secondary btn-sm" onClick={copy} id="copy-link-btn">
                    {copied ? '✅' : '📋'}
                </button>
            </div>
        </div>
    );
}
