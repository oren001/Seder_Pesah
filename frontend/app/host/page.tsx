'use client';
import { useEffect, useState, useCallback, Suspense, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import { ReaderContent } from '../reader/page';

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';
const TOTAL_SECTIONS = 19;
interface Participant { id: string; selfieUrl: string; }
interface Room { status: string; currentSectionIndex: number; participants: Participant[]; generatedImages: { id: string }[]; }
interface CostEstimate { participantCount: number; sceneCount: number; estimatedCostUSD: string; }

function HostContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const roomId = (searchParams.get('room') ?? '').toUpperCase();
    const hostId = searchParams.get('hostId') ?? '';
    const [room, setRoom] = useState<Room | null>(null);
    const [socket, setSocket] = useState<Socket | null>(null);
    const [estimate, setEstimate] = useState<CostEstimate | null>(null);
    const [generating, setGenerating] = useState(false);
    const [genProgress, setGenProgress] = useState({ completed: 0, total: 0 });
    const [copied, setCopied] = useState(false);

    // Host Selfie State
    const [participantId, setParticipantId] = useState<string | null>(null);
    const [cameraStep, setCameraStep] = useState<'intro' | 'camera' | 'preview' | 'uploading'>('intro');
    const [cameraError, setCameraError] = useState('');
    const [selfieDataUrl, setSelfieDataUrl] = useState('');
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);

    const joinUrl = typeof window !== 'undefined' ? `${window.location.origin}/join/?room=${roomId}` : '';

    // Check if host already joined on mount
    useEffect(() => {
        if (typeof window !== 'undefined' && roomId) {
            const pid = sessionStorage.getItem(`participant_${roomId}`);
            if (pid) setParticipantId(pid);
        }
    }, [roomId]);

    useEffect(() => {
        if (!roomId) return;
        let isSubscribed = true;

        // Fetch initial state
        fetch(`${BACKEND}/api/rooms/${roomId}`)
            .then(res => res.json())
            .then(data => { if (isSubscribed && data && !data.error) setRoom(data); })
            .catch(console.error);

        // Setup real-time socket
        const s = io(BACKEND);
        s.emit('join-room', { roomId });
        s.on('room-updated', ({ room }) => {
            if (isSubscribed) setRoom(room);
        });
        s.on('generation-progress', (d: { completed: number; total: number }) => {
            if (!isSubscribed) return;
            setGenProgress(d);
            if (d.completed >= d.total && d.total > 0) setGenerating(false);
        });
        setSocket(s);

        return () => {
            isSubscribed = false;
            s.disconnect();
        };
    }, [roomId]);

    useEffect(() => {
        if (!room || room.participants.length === 0) return;
        fetch(`${BACKEND}/api/scenes/estimate/${roomId}`).then(r => r.json()).then(setEstimate).catch(() => { });
    }, [roomId, room?.participants.length]);

    const startSeder = useCallback(() => { socket?.emit('start-seder', { roomId }); }, [socket, roomId]);
    const nextPage = useCallback(() => socket?.emit('next-page', { roomId }), [socket, roomId]);
    const prevPage = useCallback(() => socket?.emit('prev-page', { roomId }), [socket, roomId]);
    const finishSeder = useCallback(() => { socket?.emit('finish-seder', { roomId }); router.push(`/gallery/?room=${roomId}`); }, [socket, roomId, router]);
    const generateScenes = useCallback(async () => { setGenerating(true); setGenProgress({ completed: 0, total: 0 }); await fetch(`${BACKEND}/api/scenes/generate/${roomId}`, { method: 'POST' }); }, [roomId]);
    const copy = useCallback(async () => { await navigator.clipboard.writeText(joinUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); }, [joinUrl]);

    // Camera functions (port of Join flow)
    const startCamera = useCallback(async () => {
        setCameraStep('camera');
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } } });
            streamRef.current = stream;
            if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); }
        } catch { setCameraError('הגישה למצלמה נדחתה. אנא אפשרו גישה ונסו שוב.'); setCameraStep('intro'); }
    }, []);

    const takeSelfie = useCallback(() => {
        const video = videoRef.current; const canvas = canvasRef.current;
        if (!video || !canvas) return;
        canvas.width = 512; canvas.height = 512;
        const ctx = canvas.getContext('2d')!;
        ctx.save(); ctx.scale(-1, 1); ctx.drawImage(video, -512, 0, 512, 512); ctx.restore();
        setSelfieDataUrl(canvas.toDataURL('image/jpeg', 0.7));
        streamRef.current?.getTracks().forEach((t) => t.stop());
        setCameraStep('preview');
    }, []);

    const joinAsHost = useCallback(async () => {
        setCameraStep('uploading'); setCameraError('');
        try {
            const res = await fetch(`${BACKEND}/api/rooms/${roomId}/join`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ selfieDataUrl }),
            });
            if (!res.ok) throw new Error('שגיאה בהצטרפות לחדר');
            const data = await res.json();
            const pid = data.participant.id;
            sessionStorage.setItem(`participant_${roomId}`, pid);
            setParticipantId(pid);
        } catch (err: unknown) { setCameraError(err instanceof Error ? err.message : 'שגיאה. נסו שוב.'); setCameraStep('preview'); }
    }, [roomId, selfieDataUrl]);

    void hostId;
    const participants = room?.participants ?? [];
    const currentSection = room?.currentSectionIndex ?? 0;
    const isActive = room?.status === 'active';
    const genPct = genProgress.total > 0 ? (genProgress.completed / genProgress.total) * 100 : 0;

    return (
        <div style={{ width: '100%', maxWidth: 440, paddingBottom: 40 }}>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
                <div style={{ fontSize: '2.5rem' }}>👑</div>
                <h1 className="font-hebrew" style={{ fontSize: '1.6rem', color: 'var(--gold-dark)', fontWeight: 900 }}>לוח בקרת המארח</h1>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>חדר: {roomId}</p>
            </div>

            {/* Share link */}
            <div className="card" style={{ marginBottom: 14 }}>
                <p className="font-hebrew" style={{ color: 'var(--text-mid)', fontSize: '0.82rem', marginBottom: 8, fontWeight: 600 }}>📱 קישור הצטרפות</p>
                <div style={{ display: 'flex', gap: 8 }}>
                    <div className="input" style={{ fontSize: '0.72rem', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', direction: 'ltr' }}>{joinUrl}</div>
                    <button className="btn btn-secondary btn-sm" onClick={copy} id="copy-link-btn">{copied ? '✅' : '📋'}</button>
                </div>
            </div>

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 14 }}>
                {[{ label: 'משתתפים', value: participants.length, icon: '👥' }, { label: 'סצנות', value: 23, icon: '🎨' }, { label: 'תמונות', value: room?.generatedImages.length ?? 0, icon: '✅' }].map(({ label, value, icon }) => (
                    <div key={label} className="card-outlined" style={{ textAlign: 'center', padding: '14px 8px' }}>
                        <div style={{ fontSize: '1.3rem' }}>{icon}</div>
                        <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--gold-dark)' }}>{value}</div>
                        <div className="font-hebrew" style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{label}</div>
                    </div>
                ))}
            </div>

            {/* Host Selfie Flow */}
            {!participantId && (
                <div className="card-gold" style={{ marginBottom: 14 }}>
                    <p className="font-hebrew" style={{ color: 'var(--gold-dark)', fontSize: '0.9rem', marginBottom: 10, fontWeight: 700, textAlign: 'center' }}>📸 גם המארח משתתף!</p>
                    {cameraStep === 'intro' && (
                        <div style={{ textAlign: 'center' }}>
                            <p className="font-hebrew" style={{ color: 'var(--text-mid)', fontSize: '0.8rem', marginBottom: 12 }}>צלמו גם אתם סלפי כדי להשתתף בתמונות.</p>
                            {cameraError && <p style={{ color: '#C0392B', marginBottom: 10, fontSize: '0.8rem' }}>{cameraError}</p>}
                            <button className="btn btn-primary btn-sm btn-full" onClick={startCamera}>📷 התחילו מצלמה</button>
                        </div>
                    )}
                    {cameraStep === 'camera' && (
                        <div className="animate-fade-in" style={{ textAlign: 'center' }}>
                            <div style={{ position: 'relative', borderRadius: 16, overflow: 'hidden', aspectRatio: '1', background: '#000', maxWidth: 220, margin: '0 auto 12px' }}>
                                <video ref={videoRef} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} playsInline muted />
                            </div>
                            <button className="btn btn-primary btn-sm btn-full animate-pulse-gold" onClick={takeSelfie}>📸 צלמו</button>
                        </div>
                    )}
                    {cameraStep === 'preview' && (
                        <div className="animate-fade-in" style={{ textAlign: 'center' }}>
                            <div style={{ width: 120, height: 120, margin: '0 auto 14px', borderRadius: '50%', overflow: 'hidden', border: '3px solid var(--gold)' }}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={selfieDataUrl} alt="הסלפי שלך" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            </div>
                            {cameraError && <p style={{ color: '#C0392B', marginBottom: 10, fontSize: '0.8rem' }}>{cameraError}</p>}
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button className="btn btn-secondary btn-sm" onClick={() => { setSelfieDataUrl(''); startCamera(); }} style={{ flex: 1 }}>↩ שוב</button>
                                <button className="btn btn-primary btn-sm" onClick={joinAsHost} style={{ flex: 2 }}>✅ הצטרף</button>
                            </div>
                        </div>
                    )}
                    {cameraStep === 'uploading' && <p className="font-hebrew" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>מצטרף…</p>}
                    <canvas ref={canvasRef} style={{ display: 'none' }} />
                </div>
            )}

            {/* Participants */}
            {participants.length > 0 && (
                <div className="card" style={{ marginBottom: 14 }}>
                    <p className="font-hebrew" style={{ color: 'var(--text-mid)', fontSize: '0.82rem', marginBottom: 10, fontWeight: 600 }}>👥 משתתפים</p>
                    <div className="participants-grid">
                        {participants.map(p => <img key={p.id} src={p.selfieUrl} alt="משתתף" className="participant-avatar" />)}
                    </div>
                </div>
            )}

            {/* AI Generation */}
            <div className="card" style={{ marginBottom: 14 }}>
                <p className="font-hebrew" style={{ color: 'var(--text-mid)', fontSize: '0.82rem', marginBottom: 10, fontWeight: 600 }}>🎨 יצירת סצנות AI</p>
                {estimate && (
                    <div className="card-gold" style={{ marginBottom: 12, padding: '10px 14px' }}>
                        <p className="font-hebrew" style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{estimate.participantCount} משתתפים · {estimate.sceneCount} סצנות</p>
                        <p style={{ fontSize: '1.1rem', color: 'var(--gold-dark)', fontWeight: 700 }}>עלות משוערת: ${estimate.estimatedCostUSD}</p>
                    </div>
                )}
                {generating && genProgress.total > 0 && (
                    <div style={{ marginBottom: 12 }}>
                        <p className="font-hebrew" style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: 6 }}>מייצר {genProgress.completed}/{genProgress.total} סצנות…</p>
                        <div className="progress-bar-outer"><div className="progress-bar-inner" style={{ width: `${genPct}%` }} /></div>
                    </div>
                )}
                <button className="btn btn-primary btn-full" onClick={generateScenes} disabled={generating || participants.length === 0} id="generate-scenes-btn">
                    {generating ? `⚙️ מייצר (${genProgress.completed}/${genProgress.total})` : '🎨 ייצר סצנות'}
                </button>
                {participants.length === 0 && <p className="font-hebrew" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: 8 }}>ממתין למשתתפים…</p>}
            </div>

            {/* Seder Controls */}
            <div className="card">
                <p className="font-hebrew" style={{ color: 'var(--text-mid)', fontSize: '0.82rem', marginBottom: 12, fontWeight: 600 }}>🎬 ניהול הסדר</p>
                {!isActive ? (
                    <button className="btn btn-primary btn-full btn-lg animate-pulse-gold" onClick={startSeder} disabled={participants.length === 0} id="start-seder-btn">
                        ▶ התחל סדר
                    </button>
                ) : (
                    <>
                        <p className="font-hebrew" style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: 10 }}>פרק {currentSection + 1} מתוך {TOTAL_SECTIONS}</p>
                        <div className="progress-bar-outer" style={{ marginBottom: 14 }}>
                            <div className="progress-bar-inner" style={{ width: `${((currentSection + 1) / TOTAL_SECTIONS) * 100}%` }} />
                        </div>
                        <div style={{ display: 'flex', gap: 10, marginBottom: 10, direction: 'rtl' }}>
                            <button className="btn btn-primary" onClick={nextPage} style={{ flex: 2 }} id="next-btn">הבא ⬅</button>
                            <button className="btn btn-secondary" onClick={prevPage} style={{ flex: 1 }} disabled={currentSection === 0} id="prev-btn">➡ הקודם</button>
                        </div>
                        <button className="btn btn-danger btn-full btn-sm" onClick={finishSeder} id="finish-btn">🏁 סיים סדר</button>
                    </>
                )}
            </div>

            {/* Injected Reader View for the Host */}
            {isActive && (
                <div style={{ marginTop: 24, borderTop: '2px dashed var(--gold)', paddingTop: 24 }}>
                    <p className="font-hebrew" style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 16 }}>📖 תצוגת הגדה (מה שהמשתתפים רואים)</p>
                    <div className="card" style={{ padding: 0, overflow: 'hidden', background: 'var(--pearl)' }}>
                        <ReaderContent isHost={true} />
                    </div>
                </div>
            )}
        </div>
    );
}

export default function HostPage() {
    return <main className="page" style={{ justifyContent: 'flex-start', paddingTop: 20 }}><Suspense fallback={<div className="card" style={{ padding: 40, textAlign: 'center' }}><p>טוען…</p></div>}><HostContent /></Suspense></main>;
}
