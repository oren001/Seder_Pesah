'use client';
import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { io } from 'socket.io-client';

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

interface Participant { id: string; selfieUrl: string; }
interface GeneratedImage { id: string; sceneId: string; sectionId: string; imageUrl: string; }
interface VoteChoice { participantId: string; label: string; votes: string[]; }
interface Vote { id: string; question: string; status: string; choices: VoteChoice[]; }
interface Room { status: string; currentSectionIndex: number; participants: Participant[]; generatedImages: GeneratedImage[]; votes: Vote[]; }
interface CostEstimate { participantCount: number; sceneCount: number; estimatedCostUSD: string; }

const SECTIONS = [
    { id: 'kadesh', order: 1, he: 'קַדֵּשׁ', text: 'בָּרוּךְ אַתָּה יְיָ, אֱלֹהֵינוּ מֶלֶךְ הָעוֹלָם, בּוֹרֵא פְּרִי הַגָּפֶן.', trans: "Baruch Atah Adonai, borei p'ri hagafen." },
    { id: 'urchatz', order: 2, he: 'וּרְחַץ', text: 'נוֹטְלִים אֶת הַיָּדַיִם.', trans: 'נטילת ידיים ללא ברכה — רגע של הכנה שקטה.' },
    { id: 'karpas', order: 3, he: 'כַּרְפַּס', text: 'בָּרוּךְ אַתָּה יְיָ, אֱלֹהֵינוּ מֶלֶךְ הָעוֹלָם, בּוֹרֵא פְּרִי הָאֲדָמָה.', trans: 'טובלים ירק במי מלח — מי המלח הם דמעות אבותינו במצרים.' },
    { id: 'yachatz', order: 4, he: 'יַחַץ', text: 'בּוֹצְעִים אֶת הַמַּצָּה הָאֶמְצָעִית לִשְׁנַיִם.', trans: 'המצה האמצעית נשברת. החלק הנחבא הוא האפיקומן.' },
    { id: 'maggid-intro', order: 5, he: 'מַגִּיד', text: 'הָא לַחְמָא עַנְיָא דִּי אֲכָלוּ אַבְהָתָנָא בְּאַרְעָא דְמִצְרָיִם.\nכָּל דִּכְפִין יֵיתֵי וְיֵיכוֹל.', trans: 'זה לחם העוני שאכלו אבותינו במצרים. כל מי שרעב — יבוא ויאכל!' },
    { id: 'mah-nishtana', order: 6, he: 'מַה נִּשְׁתַּנָּה', text: 'מַה נִּשְׁתַּנָּה הַלַּיְלָה הַזֶּה מִכָּל הַלֵּילוֹת?\nשֶׁבְּכָל הַלֵּילוֹת אָנוּ אוֹכְלִין חָמֵץ וּמַצָּה —\nהַלַּיְלָה הַזֶּה כֻּלּוֹ מַצָּה.', trans: 'מה נשתנה הלילה הזה מכל הלילות?' },
    { id: 'avadim', order: 7, he: 'עֲבָדִים הָיִינוּ', text: 'עֲבָדִים הָיִינוּ לְפַרְעֹה בְּמִצְרָיִם,\nוַיּוֹצִיאֵנוּ יְיָ אֱלֹהֵינוּ מִשָּׁם\nבְּיָד חֲזָקָה וּבִזְרֹעַ נְטוּיָה.', trans: 'עבדים היינו לפרעה במצרים, והוציאנו ה׳ בזרוע נטויה.' },
    { id: 'four-sons', order: 8, he: 'אַרְבָּעָה בָנִים', text: 'אֶחָד חָכָם,\nוְאֶחָד רָשָׁע,\nוְאֶחָד תָּם,\nוְאֶחָד שֶׁאֵינוֹ יוֹדֵעַ לִשְׁאוֹל.', trans: 'אחד חכם, אחד רשע, אחד תם, ואחד שאינו יודע לשאול.', hasVote: true, voteQuestion: 'מי הבן החכם הלילה? 🦉' },
    { id: 'ten-plagues', order: 9, he: 'עֶשֶׂר מַכּוֹת', text: 'דָּם. צְפַרְדֵּעַ. כִּנִּים.\nעָרוֹב. דֶּבֶר. שְׁחִין.\nבָּרָד. אַרְבֶּה. חֹשֶׁךְ.\nמַכַּת בְּכוֹרוֹת.', trans: 'דם | צפרדע | כינים | ערוב | דבר | שחין | ברד | ארבה | חושך | מכת בכורות', plagues: true },
    { id: 'dayenu', order: 10, he: 'דַּיֵּנוּ', text: 'אִלּוּ הוֹצִיאָנוּ מִמִּצְרַיִם — דַּיֵּנוּ!\nאִלּוּ נָתַן לָנוּ אֶת הַשַּׁבָּת — דַּיֵּנוּ!\nאִלּוּ נָתַן לָנוּ אֶת הַתּוֹרָה — דַּיֵּנוּ!', trans: 'דיינו!' },
    { id: 'pesach-matzah-maror', order: 11, he: 'פֶּסַח מַצָּה וּמָרוֹר', text: 'רַבָּן גַּמְלִיאֵל הָיָה אוֹמֵר:\nכָּל שֶׁלֹּא אָמַר שְׁלֹשָׁה דְּבָרִים אֵלּוּ בַּפֶּסַח\nלֹא יָצָא יְדֵי חוֹבָתוֹ:\nפֶּסַח, מַצָּה, וּמָרוֹר.', trans: 'פסח, מצה ומרור — שלושת סמלי ליל הסדר.' },
    { id: 'hallel-part1', order: 12, he: 'הַלֵּל', text: 'הַלְלוּיָהּ, הַלְלוּ עַבְדֵי יְיָ,\nהַלְלוּ אֶת שֵׁם יְיָ.\nיְהִי שֵׁם יְיָ מְבֹרָךְ\nמֵעַתָּה וְעַד עוֹלָם.', trans: 'הללויה — שבחו עבדי ה׳, שבחו את שם ה׳!' },
    { id: 'shulchan-orech', order: 13, he: 'שֻׁלְחָן עוֹרֵךְ', text: '🍽️ אוֹכְלִים וְשׁוֹתִים לְשֹׂבַע!', trans: 'זמן האוכל! בשעה טובה ומוצלחת! תהנו מסעודת הסדר.' },
    { id: 'tzafun', order: 14, he: 'צָפוּן', text: 'מוֹצִיאִים אֶת הָאֲפִיקוֹמָן\nוְאוֹכְלִים אוֹתוֹ.', trans: '🔍 הילדים מחפשים את האפיקומן! מי שמוצא — מקבל פרס!' },
    { id: 'barech', order: 15, he: 'בָּרֵךְ', text: 'בָּרוּךְ אַתָּה יְיָ,\nהַזָּן אֶת הַכֹּל.', trans: 'ברכת המזון — מודים לשם יתברך על האוכל. יוצקים כוס שלישית.' },
    { id: 'elijah', order: 16, he: 'כּוֹס אֵלִיָּהוּ', text: 'פּוֹתְחִים אֶת הַדֶּלֶת\nלְאֵלִיָּהוּ הַנָּבִיא.', trans: '🚪 פותחים את הדלת לאליהו הנביא ויוצקים לו כוס יין.', hasVote: true, voteQuestion: 'האם היין בכוס אליהו זזז? 👀' },
    { id: 'hallel-song', order: 17, he: 'שִׁיר הַהַלֵּל', text: 'הוֹדוּ לַייָ כִּי טוֹב,\nכִּי לְעוֹלָם חַסְדּוֹ.\nיֹאמַר נָא יִשְׂרָאֵל,\nכִּי לְעוֹלָם חַסְדּוֹ.', trans: 'הודו לה׳ כי טוב — כי לעולם חסדו!' },
    { id: 'nirtzah', order: 18, he: 'נִרְצָה', text: 'חֲסַל סִדּוּר פֶּסַח כְּהִלְכָתוֹ.\nלְשָׁנָה הַבָּאָה בִּירוּשָׁלָיִם! 🕊️', trans: 'הסדר הסתיים! לשנה הבאה בירושלים!', hasVote: true, voteQuestion: 'מי היה האורח הכי טוב בסדר? 🏆' },
    { id: 'chad-gadya', order: 19, he: 'חַד גַּדְיָא', text: 'חַד גַּדְיָא, חַד גַּדְיָא.\nדְּזַבִּין אַבָּא בִּתְרֵי זוּזֵי,\nחַד גַּדְיָא, חַד גַּדְיָא.', trans: 'גדי אחד! שיר שמח ועליז לסיום הסדר. 🐐' },
];

export function ReaderContent({ isHost = false }: { isHost?: boolean }) {
    const searchParams = useSearchParams();
    const router = useRouter();
    const roomId = (searchParams.get('room') ?? '').toUpperCase();
    const participantId = typeof window !== 'undefined' ? sessionStorage.getItem(`participant_${roomId}`) : null;

    const [room, setRoom] = useState<Room | null>(null);
    const [latestImage, setLatestImage] = useState<GeneratedImage | null>(null);
    const [showImage, setShowImage] = useState(false);
    const [activeVote, setActiveVote] = useState<Vote | null>(null);
    const [myVote, setMyVote] = useState('');
    const [socket, setSocket] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any

    // Unified Menu State
    const [menuOpen, setMenuOpen] = useState(false);
    const isHostUser = typeof window !== 'undefined' ? sessionStorage.getItem(`isHost_${roomId}`) === 'true' : false;
    const [estimate, setEstimate] = useState<CostEstimate | null>(null);
    const [generating, setGenerating] = useState(false);
    const [genProgress, setGenProgress] = useState({ completed: 0, total: 0 });
    const [copied, setCopied] = useState(false);
    const joinUrl = typeof window !== 'undefined' ? `${window.location.origin}/join/?room=${roomId}` : '';

    useEffect(() => {
        if (!('wakeLock' in navigator)) return;
        let lock: { release: () => Promise<void> };
        (navigator.wakeLock as { request: (t: string) => Promise<typeof lock> }).request('screen').then(l => { lock = l; }).catch(() => { });
        return () => { lock?.release(); };
    }, []);

    useEffect(() => {
        if (!roomId) return;
        let isSubscribed = true;
        let prevImageId = '';

        const handleRoomData = (data: Room) => {
            if (!isSubscribed) return;
            setRoom(data);
            const section = SECTIONS[data.currentSectionIndex];
            if (section) {
                const imgs = data.generatedImages?.filter(i => i.sectionId === section.id) ?? [];
                if (imgs.length > 0) {
                    const newest = imgs[imgs.length - 1];
                    if (newest.id !== prevImageId) {
                        prevImageId = newest.id;
                        setLatestImage(newest);
                        setShowImage(true);
                    }
                }
            }
            setActiveVote(data.votes?.find(v => v.status === 'open') ?? null);
            if (data.status === 'finished') router.replace(`/gallery/?room=${roomId}`);
        };

        fetch(`${BACKEND}/api/rooms/${roomId}`)
            .then(res => res.json())
            .then(data => { if (!data.error) handleRoomData(data); })
            .catch(console.error);

        const s = io(BACKEND);
        setSocket(s);
        s.emit('join-room', { roomId });
        s.on('room-updated', ({ room }) => handleRoomData(room));
        s.on('page-changed', ({ sectionIndex }) => {
            if (!isSubscribed) return;
            setRoom(r => r ? { ...r, currentSectionIndex: sectionIndex } : null);
        });
        s.on('generation-progress', (d: { completed: number; total: number }) => {
            if (!isSubscribed) return;
            setGenProgress(d);
            if (d.completed >= d.total && d.total > 0) setGenerating(false);
        });
        s.on('seder-finished', () => router.replace(`/gallery/?room=${roomId}`));

        return () => {
            isSubscribed = false;
            s.disconnect();
        };
    }, [roomId, router]);

    const castVote = useCallback(async (choiceParticipantId: string) => {
        if (!activeVote || !participantId) return;
        setMyVote(choiceParticipantId);
        await fetch(`${BACKEND}/api/rooms/${roomId}/vote`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ voteId: activeVote.id, participantId, choiceParticipantId }),
        });
    }, [activeVote, participantId, roomId]);

    // Host & Menu Actions
    useEffect(() => {
        if (!isHostUser || !room || room.participants.length === 0) return;
        fetch(`${BACKEND}/api/scenes/estimate/${roomId}`).then(r => r.json()).then(setEstimate).catch(() => { });
    }, [roomId, room?.participants.length, isHostUser]);

    const startSeder = useCallback(() => { socket?.emit('start-seder', { roomId }); setMenuOpen(false); }, [socket, roomId]);
    const nextPage = useCallback(() => socket?.emit('next-page', { roomId }), [socket, roomId]);
    const prevPage = useCallback(() => socket?.emit('prev-page', { roomId }), [socket, roomId]);
    const finishSeder = useCallback(() => { socket?.emit('finish-seder', { roomId }); router.push(`/gallery/?room=${roomId}`); }, [socket, roomId, router]);
    const generateScenes = useCallback(async () => { setGenerating(true); setGenProgress({ completed: 0, total: 0 }); await fetch(`${BACKEND}/api/scenes/generate/${roomId}`, { method: 'POST' }); }, [roomId]);
    const copy = useCallback(async () => { await navigator.clipboard.writeText(joinUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); }, [joinUrl]);

    const section = SECTIONS[room?.currentSectionIndex ?? 0];
    const progress = room ? ((room.currentSectionIndex + 1) / SECTIONS.length) * 100 : 0;

    return (
        <main style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', maxWidth: 560, margin: '0 auto', width: '100%' }}>
            {/* Top bar (hidden if embedded inside old host view) */}
            {!isHost && (
                <div style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid rgba(200,146,42,0.15)', flexShrink: 0, background: 'rgba(253,251,247,0.85)', backdropFilter: 'blur(12px)', position: 'sticky', top: 0, zIndex: 10 }}>
                    <button className="btn btn-secondary btn-sm" style={{ padding: '6px 10px', fontSize: '1.2rem', minWidth: 'auto', background: 'transparent', border: 'none', boxShadow: 'none' }} onClick={() => setMenuOpen(true)}>
                        ☰
                    </button>
                    <div className="progress-bar-outer" style={{ flex: 1 }}><div className="progress-bar-inner" style={{ width: `${progress}%` }} /></div>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>{(room?.currentSectionIndex ?? 0) + 1}/{SECTIONS.length}</span>
                </div>
            )}

            {/* Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px 20px 32px' }}>
                {section ? (
                    <div className="animate-fade-in" key={section.id}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                            <span className="badge badge-gold">{section.order}. {section.he.replace(/[ּׁׂ]/g, '')}</span>
                        </div>
                        <h1 className="font-hebrew section-title-hebrew" style={{ marginBottom: 16, direction: 'rtl', textAlign: 'right' }}>{section.he}</h1>
                        <hr className="gold-divider" style={{ margin: '0 0 20px', marginRight: 0 }} />
                        <p className="haggadah-hebrew" style={{ whiteSpace: 'pre-line', marginBottom: 16, textAlign: 'right' }}>{section.text}</p>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.8, whiteSpace: 'pre-line', direction: 'rtl', textAlign: 'right' }}>{section.trans}</p>

                        {section.plagues && (
                            <div className="card-gold" style={{ marginTop: 20 }}>
                                <p className="font-hebrew" style={{ fontSize: '0.9rem', color: 'var(--gold-dark)', marginBottom: 10, fontWeight: 600 }}>🪶 לכל מכה — טיפת יין מהכוס!</p>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                    {['🩸 דם', '🐸 צפרדע', '🦟 כינים', '🦁 ערוב', '🐄 דבר', '🤕 שחין', '🌨️ ברד', '🦗 ארבה', '🌑 חושך', '💔 מכת בכורות'].map(p => (
                                        <span key={p} className="badge badge-gold">{p}</span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                ) : null}
            </div>

            {/* Vote panel */}
            {activeVote && (
                <div style={{ padding: '16px 20px', borderTop: '1px solid rgba(200,146,42,0.15)', background: 'rgba(253,251,247,0.9)', backdropFilter: 'blur(12px)' }}>
                    <p className="font-hebrew" style={{ fontWeight: 700, color: 'var(--gold-dark)', textAlign: 'center', marginBottom: 12 }}>{activeVote.question}</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {activeVote.choices.map(choice => {
                            const total = activeVote.choices.reduce((a, c) => a + c.votes.length, 0);
                            const pct = total > 0 ? (choice.votes.length / total) * 100 : 0;
                            return (
                                <button key={choice.participantId} className={`vote-choice${myVote === choice.participantId ? ' selected' : ''}`} onClick={() => castVote(choice.participantId)}>
                                    <span className="font-hebrew" style={{ fontSize: '0.85rem', flex: 1, textAlign: 'right' }}>{choice.label}</span>
                                    <div className="vote-bar"><div className="vote-bar-fill" style={{ width: `${pct}%` }} /></div>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', minWidth: 20 }}>{choice.votes.length}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Scene overlay */}
            {showImage && latestImage && (
                <div className="scene-overlay" onClick={() => setShowImage(false)} role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && setShowImage(false)}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={latestImage.imageUrl} alt="סצנה" className="scene-image" />
                    <p className="font-hebrew" style={{ position: 'absolute', bottom: 24, color: 'rgba(253,251,247,0.6)', fontSize: '0.8rem' }}>הקישו להמשיך</p>
                </div>
            )}

            {/* Global Slide-out Menu */}
            {menuOpen && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', justifyContent: 'flex-start' }}>
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }} onClick={() => setMenuOpen(false)} />
                    <div className="card" style={{ position: 'relative', width: '85%', maxWidth: 360, height: '100%', margin: 0, borderRadius: '0 24px 24px 0', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h2 className="font-hebrew" style={{ fontSize: '1.4rem', color: 'var(--gold-dark)', fontWeight: 900 }}>תפריט הסדר</h2>
                            <button className="btn btn-secondary btn-sm" style={{ minWidth: 'auto', padding: '6px 12px' }} onClick={() => setMenuOpen(false)}>✕</button>
                        </div>

                        <div style={{ borderBottom: '1px dashed var(--gold)', paddingBottom: 16 }}>
                            <p className="font-hebrew" style={{ color: 'var(--text-mid)', fontSize: '0.82rem', marginBottom: 8, fontWeight: 600 }}>📱 קישור החדר (שלחו למאחרים)</p>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <div className="input" style={{ fontSize: '0.7rem', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', direction: 'ltr' }}>{joinUrl}</div>
                                <button className="btn btn-secondary btn-sm" onClick={copy}>{copied ? '✅' : '📋'}</button>
                            </div>
                        </div>

                        {room && room.participants.length > 0 && (
                            <div style={{ borderBottom: '1px dashed var(--gold)', paddingBottom: 16 }}>
                                <p className="font-hebrew" style={{ color: 'var(--text-mid)', fontSize: '0.82rem', marginBottom: 10, fontWeight: 600 }}>👥 משתתפים ({room.participants.length})</p>
                                <div className="participants-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                                    {room.participants.map(p => <img key={p.id} src={p.selfieUrl} alt="משתתף" className="participant-avatar" />)}
                                </div>
                            </div>
                        )}

                        {isHostUser && (
                            <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
                                <div className="card-gold" style={{ padding: '12px 16px' }}>
                                    <p className="font-hebrew" style={{ fontSize: '0.9rem', color: 'var(--gold-dark)', fontWeight: 700, marginBottom: 8 }}>👑 כלי מארח</p>

                                    {room?.status !== 'active' ? (
                                        <button className="btn btn-primary btn-full btn-sm animate-pulse-gold" onClick={startSeder} disabled={!room?.participants.length}>▶ התחל סדר לכולם</button>
                                    ) : (
                                        <div style={{ display: 'flex', gap: 8, direction: 'rtl', marginBottom: 12 }}>
                                            <button className="btn btn-primary btn-sm" onClick={nextPage} style={{ flex: 2 }}>הבא ⬅</button>
                                            <button className="btn btn-secondary btn-sm" onClick={prevPage} style={{ flex: 1 }} disabled={room.currentSectionIndex === 0}>➡ הקודם</button>
                                        </div>
                                    )}

                                    <hr style={{ border: 'none', borderTop: '1px dashed rgba(200,146,42,0.4)', margin: '12px 0' }} />

                                    <p className="font-hebrew" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 6 }}>יצירת תמונות AI מרוכזת:</p>
                                    {generating && genProgress.total > 0 && (
                                        <div style={{ marginBottom: 12 }}>
                                            <p className="font-hebrew" style={{ fontSize: '0.7rem', color: 'var(--gold-dark)', marginBottom: 4 }}>מייצר {genProgress.completed}/{genProgress.total} סצנות…</p>
                                            <div className="progress-bar-outer"><div className="progress-bar-inner" style={{ width: `${(genProgress.completed / genProgress.total) * 100}%` }} /></div>
                                        </div>
                                    )}
                                    <button className="btn btn-secondary btn-full btn-sm" onClick={generateScenes} disabled={generating || !room?.participants.length}>
                                        {generating ? '⚙️ בתהליך...' : '🎨 ייצר את כל תמונות ההגדה'}
                                    </button>
                                    {estimate && !generating && <p className="font-hebrew" style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: 4 }}>עלות: ${estimate.estimatedCostUSD}</p>}

                                    {room?.status === 'active' && (
                                        <button className="btn btn-danger btn-full btn-sm" style={{ marginTop: 16 }} onClick={finishSeder}>🏁 סיים את הסדר</button>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </main>
    );
}

export default function ReaderPage() {
    return <Suspense fallback={<div className="page"><p>טוען…</p></div>}><ReaderContent /></Suspense>;
}
