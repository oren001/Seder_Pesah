'use client';
import { useState, useRef, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';
type Step = 'intro' | 'camera' | 'preview' | 'uploading';

function JoinContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const roomId = searchParams.get('room') ?? '';

    const [step, setStep] = useState<Step>('intro');
    const [error, setError] = useState('');
    const [selfieDataUrl, setSelfieDataUrl] = useState('');
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);

    const startCamera = useCallback(async () => {
        setStep('camera');
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } } });
            streamRef.current = stream;
            if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); }
        } catch { setError('הגישה למצלמה נדחתה. אנא אפשרו גישה ונסו שוב.'); setStep('intro'); }
    }, []);

    const takeSelfie = useCallback(() => {
        const video = videoRef.current; const canvas = canvasRef.current;
        if (!video || !canvas) return;
        canvas.width = 512; canvas.height = 512;
        const ctx = canvas.getContext('2d')!;
        ctx.save(); ctx.scale(-1, 1); ctx.drawImage(video, -512, 0, 512, 512); ctx.restore();
        setSelfieDataUrl(canvas.toDataURL('image/jpeg', 0.7));
        streamRef.current?.getTracks().forEach((t) => t.stop());
        setStep('preview');
    }, []);

    const joinRoom = useCallback(async () => {
        setStep('uploading'); setError('');
        try {
            const res = await fetch(`${BACKEND}/api/rooms/${roomId}/join`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ selfieDataUrl }),
            });
            if (!res.ok) throw new Error('החדר לא נמצא');
            const data = await res.json();
            sessionStorage.setItem(`participant_${roomId}`, data.participant.id);
            router.push(`/lobby/?room=${roomId}`);
        } catch (err: unknown) { setError(err instanceof Error ? err.message : 'שגיאה. נסו שוב.'); setStep('preview'); }
    }, [roomId, selfieDataUrl, router]);

    if (!roomId) return (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
            <p className="font-hebrew" style={{ color: 'var(--text-muted)' }}>קישור לא תקין — בקשו מהמארח לשלוח שוב</p>
        </div>
    );

    return (
        <div style={{ width: '100%', maxWidth: 440 }}>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
                <h1 className="font-hebrew" style={{ fontSize: '1.8rem', color: 'var(--gold-dark)', fontWeight: 900 }}>הצטרפות לסדר</h1>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>חדר: {roomId}</p>
            </div>

            {step === 'intro' && (
                <div className="card animate-fade-in" style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '3.5rem', marginBottom: 16 }}>🤳</div>
                    <h2 className="font-hebrew" style={{ fontSize: '1.2rem', color: 'var(--text-dark)', marginBottom: 10 }}>צלמו סלפי והופיעו ביציאת מצרים!</h2>
                    <p className="font-hebrew" style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 22, lineHeight: 1.8 }}>פניכם יופיעו בסצנות AI מההגדה. ללא הרשמה.</p>
                    {error && <p style={{ color: '#C0392B', marginBottom: 12, fontSize: '0.85rem' }}>{error}</p>}
                    <button className="btn btn-primary btn-full" onClick={startCamera} id="open-camera-btn">📷 פתחו מצלמה</button>
                </div>
            )}

            {step === 'camera' && (
                <div className="animate-fade-in" style={{ textAlign: 'center' }}>
                    <div style={{ position: 'relative', borderRadius: 24, overflow: 'hidden', aspectRatio: '1', background: '#000', maxWidth: 380, margin: '0 auto 18px', boxShadow: 'var(--shadow)' }}>
                        <video ref={videoRef} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} playsInline muted />
                        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 55% 65% at 50% 45%, transparent 95%, rgba(0,0,0,0.5) 100%)', pointerEvents: 'none' }} />
                        <p className="font-hebrew" style={{ position: 'absolute', top: 14, left: 0, right: 0, textAlign: 'center', color: 'rgba(255,255,255,0.8)', fontSize: '0.8rem', textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>מקמו את הפנים בתוך העיגול</p>
                    </div>
                    <button className="btn btn-primary btn-lg animate-pulse-gold" onClick={takeSelfie} id="take-selfie-btn">📸 צלמו סלפי</button>
                </div>
            )}

            {step === 'preview' && (
                <div className="card animate-fade-in" style={{ textAlign: 'center' }}>
                    <p className="font-hebrew" style={{ color: 'var(--gold-dark)', marginBottom: 14, fontWeight: 600 }}>נראה מצוין! 🎉</p>
                    <div style={{ width: 180, height: 180, margin: '0 auto 20px', borderRadius: '50%', overflow: 'hidden', border: '3px solid var(--gold)', boxShadow: 'var(--shadow-gold)' }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={selfieDataUrl} alt="הסלפי שלך" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                    {error && <p style={{ color: '#C0392B', marginBottom: 12, fontSize: '0.85rem' }}>{error}</p>}
                    <div style={{ display: 'flex', gap: 10 }}>
                        <button className="btn btn-secondary" onClick={() => { setSelfieDataUrl(''); startCamera(); }} style={{ flex: 1 }}>↩ שוב</button>
                        <button className="btn btn-primary" onClick={joinRoom} style={{ flex: 2 }} id="join-room-btn">✅ הצטרפו לסדר!</button>
                    </div>
                </div>
            )}

            {step === 'uploading' && (
                <div className="card animate-fade-in" style={{ textAlign: 'center', padding: 40 }}>
                    <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>⏳</div>
                    <p className="font-hebrew" style={{ color: 'var(--text-mid)' }}>מצטרפים לסדר…</p>
                </div>
            )}
            <canvas ref={canvasRef} style={{ display: 'none' }} />
        </div>
    );
}

export default function JoinPage() {
    return (
        <main className="page">
            <Suspense fallback={<div className="card" style={{ padding: 40, textAlign: 'center' }}><p>טוען…</p></div>}>
                <JoinContent />
            </Suspense>
        </main>
    );
}
