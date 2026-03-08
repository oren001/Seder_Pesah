'use client';
import { useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

type Step = 'intro' | 'camera' | 'preview' | 'uploading' | 'done';

export default function JoinPage() {
    const params = useParams();
    const router = useRouter();
    const roomId = params.roomId as string;

    const [step, setStep] = useState<Step>('intro');
    const [error, setError] = useState('');
    const [selfieDataUrl, setSelfieDataUrl] = useState('');

    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);

    const startCamera = useCallback(async () => {
        setStep('camera');
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } },
            });
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.play();
            }
        } catch {
            setError('Camera access denied. Please allow camera and try again.');
            setStep('intro');
        }
    }, []);

    const takeSelfie = useCallback(() => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas) return;
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d')!;
        // Mirror + crop to square
        ctx.save();
        ctx.scale(-1, 1);
        ctx.drawImage(video, -512, 0, 512, 512);
        ctx.restore();
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        setSelfieDataUrl(dataUrl);
        // Stop stream
        streamRef.current?.getTracks().forEach((t) => t.stop());
        setStep('preview');
    }, []);

    const retake = useCallback(() => {
        setSelfieDataUrl('');
        startCamera();
    }, [startCamera]);

    const joinRoom = useCallback(async () => {
        setStep('uploading');
        setError('');
        try {
            const res = await fetch(`${BACKEND}/api/rooms/${roomId}/join`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ selfieDataUrl }),
            });
            if (!res.ok) throw new Error('Room not found');
            const data = await res.json();
            sessionStorage.setItem(`participant_${roomId}`, data.participant.id);
            sessionStorage.setItem(`selfie_${roomId}`, selfieDataUrl);
            router.push(`/room/${roomId}/lobby`);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to join. Try again.');
            setStep('preview');
        }
    }, [roomId, selfieDataUrl, router]);

    return (
        <main className="page" style={{ padding: '16px', gap: 0 }}>
            <div style={{ width: '100%', maxWidth: 480 }}>
                {/* Header */}
                <div style={{ textAlign: 'center', marginBottom: 20 }}>
                    <div style={{ fontSize: '2.5rem' }}>📸</div>
                    <h1 className="font-hebrew" style={{ fontSize: '1.8rem', color: 'var(--gold)', marginTop: 4 }}>
                        הצטרפות לסדר
                    </h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Room: {roomId}</p>
                </div>

                {/* Step: Intro */}
                {step === 'intro' && (
                    <div className="card animate-fade-in" style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '4rem', marginBottom: 16 }}>🤳</div>
                        <h2 style={{ fontSize: '1.3rem', color: 'var(--parchment)', marginBottom: 12 }}>
                            Take a selfie to appear in the Exodus!
                        </h2>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: 24, lineHeight: 1.7 }}>
                            Your face will appear in AI-generated scenes from the Haggadah. No login needed.
                        </p>
                        {error && <p style={{ color: '#FF6B6B', marginBottom: 16, fontSize: '0.85rem' }}>{error}</p>}
                        <button className="btn btn-primary btn-full" onClick={startCamera} id="open-camera-btn">
                            📷 Open Camera
                        </button>
                    </div>
                )}

                {/* Step: Camera */}
                {step === 'camera' && (
                    <div className="animate-fade-in" style={{ textAlign: 'center' }}>
                        <div style={{ position: 'relative', borderRadius: 24, overflow: 'hidden', aspectRatio: '1', background: '#000', maxWidth: 400, margin: '0 auto 20px' }}>
                            <video
                                ref={videoRef}
                                style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
                                playsInline
                                muted
                            />
                            {/* Oval guide */}
                            <div style={{
                                position: 'absolute', inset: 0,
                                background: 'radial-gradient(ellipse 55% 65% at 50% 48%, transparent 95%, rgba(0,0,0,0.6) 100%)',
                                pointerEvents: 'none',
                            }} />
                            <p style={{ position: 'absolute', top: 16, left: 0, right: 0, textAlign: 'center', color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem' }}>
                                Position your face inside the oval
                            </p>
                        </div>
                        <button className="btn btn-primary btn-lg animate-pulse-gold" onClick={takeSelfie} id="take-selfie-btn">
                            📸 Take Selfie
                        </button>
                    </div>
                )}

                {/* Step: Preview */}
                {step === 'preview' && (
                    <div className="animate-fade-in" style={{ textAlign: 'center' }}>
                        <p style={{ color: 'var(--gold-light)', marginBottom: 12, fontSize: '0.9rem' }}>Looking good! 🎉</p>
                        <div style={{ width: 200, height: 200, margin: '0 auto 20px', borderRadius: '50%', overflow: 'hidden', border: '3px solid var(--gold)', boxShadow: 'var(--shadow-gold)' }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={selfieDataUrl} alt="Your selfie" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </div>
                        {error && <p style={{ color: '#FF6B6B', marginBottom: 12, fontSize: '0.85rem' }}>{error}</p>}
                        <div style={{ display: 'flex', gap: 12 }}>
                            <button className="btn btn-secondary" onClick={retake} style={{ flex: 1 }}>↩ Retake</button>
                            <button className="btn btn-primary" onClick={joinRoom} style={{ flex: 2 }} id="join-room-btn">
                                ✅ Join Seder!
                            </button>
                        </div>
                    </div>
                )}

                {/* Step: Uploading */}
                {step === 'uploading' && (
                    <div className="card animate-fade-in" style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '3rem', marginBottom: 16 }}>⏳</div>
                        <p style={{ color: 'var(--text-secondary)' }}>Joining the Seder…</p>
                    </div>
                )}

                {/* Step: Done */}
                {step === 'done' && (
                    <div className="card animate-fade-in" style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '3rem', marginBottom: 16 }}>🎉</div>
                        <p style={{ color: 'var(--gold)' }}>You&apos;re in! Heading to the lobby…</p>
                    </div>
                )}
            </div>

            <canvas ref={canvasRef} style={{ display: 'none' }} />
        </main>
    );
}
