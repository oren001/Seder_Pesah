'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { db } from '@/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';

interface GeneratedImage { id: string; sceneId: string; sectionId: string; imageUrl: string; generatedAt: number; }
interface Room { generatedImages: GeneratedImage[]; }

const SECTION_NAMES: Record<string, string> = {
    'kadesh': 'Kadesh', 'karpas': 'Karpas', 'yachatz': 'Yachatz',
    'maggid-intro': 'Maggid', 'mah-nishtana': 'Mah Nishtanah', 'avadim': 'We Were Slaves',
    'four-sons': 'Four Sons', 'ten-plagues': 'Ten Plagues', 'dayenu': 'Dayenu',
    'pesach-matzah-maror': 'Pesach Matzah Maror', 'hallel-part1': 'Hallel', 'shulchan-orech': 'The Meal',
    'tzafun': 'Afikomen', 'barech': 'Barech', 'elijah': "Elijah's Cup",
    'hallel-song': 'Songs of Hallel', 'nirtzah': 'Nirtzah', 'chad-gadya': 'Chad Gadya',
};

export default function GalleryPage() {
    const params = useParams();
    const roomId = (params.roomId as string).toUpperCase();
    const [images, setImages] = useState<GeneratedImage[]>([]);
    const [selected, setSelected] = useState<GeneratedImage | null>(null);

    useEffect(() => {
        const unsub = onSnapshot(doc(db, 'rooms', roomId), (snap) => {
            if (snap.exists()) {
                const data = snap.data() as Room;
                setImages(data.generatedImages ?? []);
            }
        });
        return () => unsub();
    }, [roomId]);

    const downloadImage = async (img: GeneratedImage) => {
        try {
            const res = await fetch(img.imageUrl);
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `seder-${img.sceneId}.jpg`;
            a.click();
            URL.revokeObjectURL(url);
        } catch { /* ignore */ }
    };

    return (
        <main style={{ minHeight: '100dvh', padding: '20px', maxWidth: 600, margin: '0 auto' }}>
            {/* Header */}
            <div style={{ textAlign: 'center', marginBottom: 28 }}>
                <div style={{ fontSize: '3rem', marginBottom: 8 }}>🖼️</div>
                <h1 className="font-hebrew" style={{ fontSize: '2rem', color: 'var(--gold)', marginBottom: 4 }}>
                    גלריית הסדר
                </h1>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Your Seder Gallery</p>
                {images.length > 0 && (
                    <span className="badge badge-gold" style={{ marginTop: 8 }}>{images.length} scenes generated</span>
                )}
            </div>

            {images.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
                    <div style={{ fontSize: '3rem', marginBottom: 16 }}>⏳</div>
                    <p style={{ color: 'var(--text-muted)' }}>Scenes are being generated…</p>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 8 }}>Check back during the Seder!</p>
                </div>
            ) : (
                <div className="gallery-grid">
                    {images.map((img) => (
                        <div key={img.id} className="gallery-item" onClick={() => setSelected(img)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setSelected(img)}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={img.imageUrl} alt={SECTION_NAMES[img.sectionId] ?? img.sceneId} loading="lazy" />
                            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '6px 8px', background: 'linear-gradient(transparent, rgba(0,0,0,0.7))', fontSize: '0.65rem', color: 'white' }}>
                                {SECTION_NAMES[img.sectionId] ?? img.sceneId}
                            </div>
                            <button className="gallery-download" onClick={(e) => { e.stopPropagation(); downloadImage(img); }} title="Download" aria-label="Download image">⬇</button>
                        </div>
                    ))}
                </div>
            )}

            {/* Lightbox */}
            {selected && (
                <div className="scene-overlay" onClick={() => setSelected(null)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Escape' && setSelected(null)}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={selected.imageUrl} alt="Scene" className="scene-image" />
                    <div style={{ position: 'absolute', bottom: 20, display: 'flex', gap: 12 }}>
                        <button className="btn btn-secondary btn-sm" onClick={(e) => { e.stopPropagation(); downloadImage(selected); }}>⬇ Download</button>
                        <button className="btn btn-secondary btn-sm" onClick={() => setSelected(null)}>✕ Close</button>
                    </div>
                    <p style={{ position: 'absolute', top: 20, color: 'var(--gold-light)', fontSize: '0.85rem' }}>
                        {SECTION_NAMES[selected.sectionId] ?? selected.sceneId}
                    </p>
                </div>
            )}

            {/* End message */}
            {images.length > 0 && (
                <div style={{ textAlign: 'center', marginTop: 32, padding: '24px 0' }}>
                    <p style={{ fontSize: '1.5rem', marginBottom: 8 }}>🎉</p>
                    <p className="font-hebrew" style={{ fontSize: '1.3rem', color: 'var(--gold)' }}>לְשָׁנָה הַבָּאָה בִּירוּשָׁלָיִם!</p>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 6 }}>Next year in Jerusalem!</p>
                </div>
            )}
        </main>
    );
}
