'use client';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { db } from '@/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';

interface GeneratedImage { id: string; sceneId: string; sectionId: string; imageUrl: string; generatedAt: number; }
interface Room { generatedImages: GeneratedImage[]; }
const SECTION_NAMES_HE: Record<string, string> = {
    'kadesh': 'קדש', 'urchatz': 'ורחץ', 'karpas': 'כרפס', 'yachatz': 'יחץ', 'maggid-intro': 'מגיד',
    'mah-nishtana': 'מה נשתנה', 'avadim': 'עבדים היינו', 'four-sons': 'ארבעה בנים', 'ten-plagues': 'עשר מכות',
    'dayenu': 'דיינו', 'pesach-matzah-maror': 'פסח מצה ומרור', 'hallel-part1': 'הלל', 'shulchan-orech': 'שולחן עורך',
    'tzafun': 'צפון', 'barech': 'ברך', 'elijah': 'כוס אליהו', 'hallel-song': 'שיר ההלל', 'nirtzah': 'נרצה', 'chad-gadya': 'חד גדיא',
};

function GalleryContent() {
    const searchParams = useSearchParams();
    const roomId = (searchParams.get('room') ?? '').toUpperCase();
    const [images, setImages] = useState<GeneratedImage[]>([]);
    const [selected, setSelected] = useState<GeneratedImage | null>(null);

    useEffect(() => {
        if (!roomId) return;
        return onSnapshot(doc(db, 'rooms', roomId), snap => { if (snap.exists()) setImages((snap.data() as Room).generatedImages ?? []); });
    }, [roomId]);

    const download = async (img: GeneratedImage) => {
        const res = await fetch(img.imageUrl); const blob = await res.blob();
        const url = URL.createObjectURL(blob); const a = document.createElement('a');
        a.href = url; a.download = `סדר-${SECTION_NAMES_HE[img.sectionId] ?? img.sceneId}.jpg`; a.click(); URL.revokeObjectURL(url);
    };

    return (
        <div style={{ width: '100%', maxWidth: 600, paddingBottom: 40 }}>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
                <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>🖼️</div>
                <h1 className="font-hebrew" style={{ fontSize: '2rem', color: 'var(--gold-dark)', fontWeight: 900, marginBottom: 4 }}>גלריית הסדר</h1>
                {images.length > 0 && <span className="badge badge-gold">{images.length} סצנות נוצרו</span>}
            </div>

            {images.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '44px 24px' }}>
                    <div style={{ fontSize: '3rem', marginBottom: 14 }}>⏳</div>
                    <p className="font-hebrew" style={{ color: 'var(--text-muted)' }}>הסצנות עדיין מיוצרות…</p>
                </div>
            ) : (
                <div className="gallery-grid">
                    {images.map(img => (
                        <div key={img.id} className="gallery-item" onClick={() => setSelected(img)} role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && setSelected(img)}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={img.imageUrl} alt={SECTION_NAMES_HE[img.sectionId] ?? img.sceneId} loading="lazy" />
                            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '6px 8px', background: 'linear-gradient(transparent, rgba(26,18,8,0.65))', fontSize: '0.65rem', color: 'white', fontFamily: 'Heebo', textAlign: 'right' }}>
                                {SECTION_NAMES_HE[img.sectionId] ?? img.sceneId}
                            </div>
                            <button className="gallery-download" onClick={e => { e.stopPropagation(); download(img); }} aria-label="הורד">⬇</button>
                        </div>
                    ))}
                </div>
            )}

            {images.length > 0 && (
                <div style={{ textAlign: 'center', marginTop: 36, padding: '24px 0' }}>
                    <p style={{ fontSize: '1.8rem', marginBottom: 10 }}>🎉</p>
                    <p className="font-hebrew" style={{ fontSize: '1.4rem', color: 'var(--gold-dark)', fontWeight: 900 }}>לְשָׁנָה הַבָּאָה בִּירוּשָׁלָיִם!</p>
                    <p className="font-hebrew" style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: 6 }}>סדר פסח שמח!</p>
                </div>
            )}

            {selected && (
                <div className="scene-overlay" onClick={() => setSelected(null)} role="button" tabIndex={0} onKeyDown={e => e.key === 'Escape' && setSelected(null)}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={selected.imageUrl} alt="סצנה" className="scene-image" />
                    <p className="font-hebrew" style={{ position: 'absolute', top: 20, color: 'var(--gold-light)', fontSize: '0.9rem' }}>{SECTION_NAMES_HE[selected.sectionId]}</p>
                    <div style={{ position: 'absolute', bottom: 20, display: 'flex', gap: 10 }}>
                        <button className="btn btn-secondary btn-sm" onClick={e => { e.stopPropagation(); download(selected); }}>⬇ הורד</button>
                        <button className="btn btn-secondary btn-sm" onClick={() => setSelected(null)}>✕ סגור</button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function GalleryPage() {
    return <main className="page" style={{ justifyContent: 'flex-start', paddingTop: 20 }}><Suspense fallback={<div className="card" style={{ padding: 40, textAlign: 'center' }}><p>טוען…</p></div>}><GalleryContent /></Suspense></main>;
}
