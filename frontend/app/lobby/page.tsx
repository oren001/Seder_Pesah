'use client';
import { useEffect, useState, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { db } from '@/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';

interface Participant { id: string; selfieUrl: string; }
interface GeneratedImage { id: string; sceneId: string; imageUrl: string; }
interface Room { status: string; participants: Participant[]; generatedImages: GeneratedImage[]; }
const LOBBY_SCENE_IDS = ['scene-lobby-redsea', 'scene-lobby-pyramids', 'scene-lobby-staff', 'scene-lobby-leaving'];

function LobbyContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const roomId = (searchParams.get('room') ?? '').toUpperCase();
    const [room, setRoom] = useState<Room | null>(null);
    const [heroIndex, setHeroIndex] = useState(0);
    const [copied, setCopied] = useState(false);
    const participantId = typeof window !== 'undefined' ? sessionStorage.getItem(`participant_${roomId}`) : null;
    const joinUrl = typeof window !== 'undefined' ? `${window.location.origin}/join/?room=${roomId}` : '';

    useEffect(() => {
        if (!roomId) return;
        return onSnapshot(doc(db, 'rooms', roomId), (snap) => {
            if (!snap.exists()) return;
            const data = snap.data() as Room;
            setRoom(data);
            if (data.status === 'active') router.replace(`/reader/?room=${roomId}`);
        });
    }, [roomId, router]);

    const heroImages = room?.generatedImages.filter(img => LOBBY_SCENE_IDS.includes(img.sceneId)) ?? [];
    useEffect(() => {
        if (heroImages.length < 2) return;
        const t = setInterval(() => setHeroIndex(i => (i + 1) % heroImages.length), 5000);
        return () => clearInterval(t);
    }, [heroImages.length]);

    const copy = useCallback(async () => { await navigator.clipboard.writeText(joinUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); }, [joinUrl]);
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
                        <div style={{ fontSize: '3rem' }}>🌊</div>
                        <p className="font-hebrew animate-shimmer" style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>מייצר סצנות יציאת מצרים…</p>
                    </div>
                )}
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 60, background: 'linear-gradient(transparent, var(--pearl))' }} />
            </div>

            <h1 className="font-hebrew" style={{ fontSize: '1.5rem', color: 'var(--gold-dark)', fontWeight: 900, marginBottom: 4, textAlign: 'center' }}>ממתינים לתחילת הסדר…</h1>
            <p className="font-hebrew" style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', marginBottom: 18 }}>המארח יתחיל ברגע שכולם מוכנים</p>

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
