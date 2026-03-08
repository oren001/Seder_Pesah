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
      sessionStorage.setItem(`host_${data.room.id}`, data.hostId);
      router.push(`/host/?room=${data.room.id}&hostId=${data.hostId}`);
    } catch {
      setError('שגיאה ביצירת החדר. האם השרת פועל?');
      setLoading(false);
    }
  }

  return (
    <main className="page">
      <div className="container" style={{ textAlign: 'center', maxWidth: 440 }}>
        <div style={{ marginBottom: 28 }}>
          <div className="animate-float" style={{ fontSize: '5rem', marginBottom: 12, filter: 'drop-shadow(0 4px 16px rgba(200,146,42,0.3))' }}>🕍</div>
          <h1 className="font-hebrew" style={{ fontSize: 'clamp(2rem,7vw,3.2rem)', color: 'var(--gold-dark)', marginBottom: 6, fontWeight: 900, lineHeight: 1.2 }}>
            הַגָּדָה שֶׁל פֶּסַח
          </h1>
          <p className="font-hebrew" style={{ color: 'var(--text-mid)', fontSize: '1.05rem', marginBottom: 4 }}>
            הגדה אינטראקטיבית עם בינה מלאכותית
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            הופיעו ביציאת מצרים. יחד.
          </p>
        </div>

        <div className="card" style={{ marginBottom: 24, textAlign: 'right' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { icon: '🎭', text: 'צלמו סלפי והופיעו בסצנות AI מההגדה' },
              { icon: '📱', text: 'כולם קוראים יחד — מסונכרנים בטלפון' },
              { icon: '🗳️', text: 'הצביעו מי הבן החכם, פרעה ועוד' },
              { icon: '🎨', text: 'כל סדר — סיפור ויזואלי ייחודי' },
            ].map(({ icon, text }) => (
              <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: '1.2rem' }}>{icon}</span>
                <span className="font-hebrew" style={{ fontSize: '0.9rem', color: 'var(--text-mid)' }}>{text}</span>
              </div>
            ))}
          </div>
        </div>

        <button
          className="btn btn-primary btn-full btn-lg animate-pulse-gold"
          onClick={createSeder}
          disabled={loading}
          id="create-seder-btn"
        >
          {loading ? <><span className="spinner" />יוצר סדר…</> : <>✨ צור סדר פסח</>}
        </button>

        {error && <p style={{ color: '#C0392B', marginTop: 14, fontSize: '0.85rem' }}>{error}</p>}

        <p className="font-hebrew" style={{ marginTop: 20, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
          ללא הרשמה · שתפו קישור בוואטסאפ
        </p>
      </div>

      <style>{`
        .spinner { display:inline-block;width:17px;height:17px;border:2px solid rgba(255,255,255,0.35);border-top-color:white;border-radius:50%;animation:spin 0.8s linear infinite; }
        @keyframes spin { to { transform:rotate(360deg); } }
      `}</style>
    </main>
  );
}
