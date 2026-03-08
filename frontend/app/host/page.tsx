'use client';
import { useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

function HostRedirector() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const roomId = (searchParams.get('room') ?? '').toUpperCase();
    const hostId = searchParams.get('hostId');

    useEffect(() => {
        if (!roomId || !hostId) return;

        // Mark this device as the host
        sessionStorage.setItem(`isHost_${roomId}`, 'true');

        // Check if the seder is already active; if so, skip lobby
        fetch(`${BACKEND}/api/rooms/${roomId}`)
            .then(res => res.json())
            .then(data => {
                if (data && data.status === 'active') {
                    router.replace(`/reader/?room=${roomId}`);
                } else {
                    router.replace(`/lobby/?room=${roomId}`);
                }
            })
            .catch(() => {
                // Fallback to lobby on error
                router.replace(`/lobby/?room=${roomId}`);
            });
    }, [roomId, hostId, router]);

    return (
        <div style={{ width: '100%', maxWidth: 440, textAlign: 'center', paddingTop: 60 }}>
            <div style={{ fontSize: '3rem', marginBottom: 20 }}>👑</div>
            <p className="font-hebrew" style={{ color: 'var(--gold-dark)', fontSize: '1.2rem', fontWeight: 600 }}>מוגדר כמארח...</p>
            <p className="font-hebrew" style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: 10 }}>מעביר אותך לחוויה המאוחדת.</p>
        </div>
    );
}

export default function HostPage() {
    return (
        <main className="page" style={{ justifyContent: 'flex-start', paddingTop: 20 }}>
            <Suspense fallback={<div className="card" style={{ padding: 40, textAlign: 'center' }}><p>טוען…</p></div>}>
                <HostRedirector />
            </Suspense>
        </main>
    );
}
