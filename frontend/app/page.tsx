'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

export default function HomePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function createSeder() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${BACKEND}/api/rooms`, { method: 'POST' });
      const data = await res.json();
      // Store hostId in sessionStorage
      sessionStorage.setItem(`host_${data.room.id}`, data.hostId);
      router.push(`/room/${data.room.id}/host?hostId=${data.hostId}`);
    } catch {
      setError('Failed to create room. Is the server running?');
      setLoading(false);
    }
  }

  return (
    <main className="page">
      <div className="container" style={{ textAlign: 'center', maxWidth: 440 }}>
        {/* Logo & Title */}
        <div className="animate-float" style={{ fontSize: '5rem', marginBottom: 16 }}>🕍</div>

        <h1 className="font-hebrew" style={{ fontSize: 'clamp(2rem,7vw,3rem)', color: 'var(--gold)', marginBottom: 8, fontWeight: 900 }}>
          הַגָּדָה שֶׁל פֶּסַח
        </h1>
        <p className="font-latin" style={{ color: 'var(--gold-light)', fontSize: '1.1rem', marginBottom: 4 }}>
          AI Interactive Haggadah
        </p>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: 40 }}>
          Appear in the Exodus. Together.
        </p>

        <div className="card-gold" style={{ marginBottom: 32 }}>
          <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', lineHeight: 1.8 }}>
            🎭 Participants take a selfie and appear in AI-generated biblical scenes<br />
            📱 Everyone reads together, synchronized on their phones<br />
            🗳️ Vote on who plays the Wise Son, Pharaoh, and more<br />
            🎨 Every Seder becomes a unique visual story
          </p>
        </div>

        <button
          className="btn btn-primary btn-full btn-lg animate-pulse-gold"
          onClick={createSeder}
          disabled={loading}
          id="create-seder-btn"
        >
          {loading ? (
            <><span className="spinner" />Creating your Seder…</>
          ) : (
            <>✨ Create Seder</>
          )}
        </button>

        {error && (
          <p style={{ color: '#FF6B6B', marginTop: 16, fontSize: '0.85rem' }}>{error}</p>
        )}

        <p style={{ marginTop: 24, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          No account needed · Share link via WhatsApp
        </p>
      </div>

      <style>{`
        .spinner {
          display: inline-block;
          width: 18px;
          height: 18px;
          border: 2px solid rgba(10,22,40,0.3);
          border-top-color: var(--navy);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </main>
  );
}
