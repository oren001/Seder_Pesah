'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';

interface Section {
    id: string; order: number; title: string; titleHebrew: string;
    hebrew: string; transliteration?: string; english: string;
    hasVote?: boolean; voteQuestion?: string; hasScratch?: boolean;
}
interface GeneratedImage { id: string; sceneId: string; sectionId: string; imageUrl: string; }
interface Vote { id: string; question: string; status: string; choices: VoteChoice[]; winnerId?: string; }
interface VoteChoice { participantId: string; label: string; votes: string[]; }
interface Room { status: string; currentSectionIndex: number; generatedImages: GeneratedImage[]; votes: Vote[]; }

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

// Embedded section data so frontend works without backend fetch
const SECTIONS: Section[] = [
    { id: 'kadesh', order: 1, title: 'Kadesh', titleHebrew: 'קַדֵּשׁ', hebrew: 'בָּרוּךְ אַתָּה יְיָ, אֱלֹהֵינוּ מֶלֶךְ הָעוֹלָם, בּוֹרֵא פְּרִי הַגָּפֶן.', transliteration: "Baruch Atah Adonai, Eloheinu Melech haolam, borei p'ri hagafen.", english: 'Blessed are You, Eternal our God, Sovereign of the universe, who creates the fruit of the vine.' },
    { id: 'urchatz', order: 2, title: 'Urchatz', titleHebrew: 'וּרְחַץ', hebrew: 'נוֹטְלִים אֶת הַיָּדַיִם.', transliteration: 'Washing of the hands.', english: 'We wash our hands without saying a blessing — a moment of quiet preparation.' },
    { id: 'karpas', order: 3, title: 'Karpas', titleHebrew: 'כַּרְפַּס', hebrew: 'בָּרוּךְ אַתָּה יְיָ, אֱלֹהֵינוּ מֶלֶךְ הָעוֹלָם, בּוֹרֵא פְּרִי הָאֲדָמָה.', english: 'We dip vegetables in salt water — the tears of our ancestors in Egypt.' },
    { id: 'yachatz', order: 4, title: 'Yachatz', titleHebrew: 'יַחַץ', hebrew: 'בּוֹצְעִים אֶת הַמַּצָּה הָאֶמְצָעִית לִשְׁנַיִם.', english: 'The middle matzah is broken. Half becomes the Afikomen — hidden for children to find.' },
    { id: 'maggid-intro', order: 5, title: 'Maggid', titleHebrew: 'מַגִּיד', hebrew: 'הָא לַחְמָא עַנְיָא דִּי אֲכָלוּ אַבְהָתָנָא בְּאַרְעָא דְמִצְרָיִם.', transliteration: "Ha lachma anya di achalu avhatana b'ara d'Mitzrayim.", english: '"This is the bread of affliction, which our ancestors ate in Egypt. Let all who are hungry come and eat."' },
    { id: 'mah-nishtana', order: 6, title: 'Mah Nishtanah', titleHebrew: 'מַה נִּשְׁתַּנָּה', hebrew: 'מַה נִּשְׁתַּנָּה הַלַּיְלָה הַזֶּה מִכָּל הַלֵּילוֹת?\nשֶׁבְּכָל הַלֵּילוֹת אָנוּ אוֹכְלִין חָמֵץ וּמַצָּה, הַלַּיְלָה הַזֶּה כֻּלּוֹ מַצָּה.', transliteration: 'Mah nishtanah halailah hazeh mikol haleilot?', english: 'Why is this night different from all other nights?' },
    { id: 'avadim', order: 7, title: 'We Were Slaves', titleHebrew: 'עֲבָדִים הָיִינוּ', hebrew: 'עֲבָדִים הָיִינוּ לְפַרְעֹה בְּמִצְרָיִם, וַיּוֹצִיאֵנוּ יְיָ אֱלֹהֵינוּ מִשָּׁם בְּיָד חֲזָקָה וּבִזְרֹעַ נְטוּיָה.', transliteration: "Avadim hayinu l'Pharaoh b'Mitzrayim.", english: 'We were slaves to Pharaoh in Egypt, and God brought us out with a mighty hand.' },
    { id: 'four-sons', order: 8, title: 'The Four Sons', titleHebrew: 'אַרְבָּעָה בָנִים', hebrew: 'אֶחָד חָכָם, וְאֶחָד רָשָׁע, וְאֶחָד תָּם, וְאֶחָד שֶׁאֵינוֹ יוֹדֵעַ לִשְׁאוֹל.', english: 'One wise, one wicked, one simple, one who does not know how to ask.', hasVote: true, voteQuestion: 'Who is the Wise Son tonight? 🦉' },
    { id: 'ten-plagues', order: 9, title: 'The Ten Plagues', titleHebrew: 'עֶשֶׂר מַכּוֹת', hebrew: 'דָּם. צְפַרְדֵּעַ. כִּנִּים. עָרוֹב. דֶּבֶר. שְׁחִין. בָּרָד. אַרְבֶּה. חֹשֶׁךְ. מַכַּת בְּכוֹרוֹת.', transliteration: 'Dam. Tzfardea. Kinim. Arov. Dever. Shchin. Barad. Arbeh. Choshech. Makat Bechorot.', english: 'Blood. Frogs. Lice. Wild Animals. Cattle Disease. Boils. Hail. Locusts. Darkness. Death of the Firstborn.', hasScratch: true },
    { id: 'dayenu', order: 10, title: 'Dayenu', titleHebrew: 'דַּיֵּנוּ', hebrew: 'אִלּוּ הוֹצִיאָנוּ מִמִּצְרַיִם, דַּיֵּנוּ!\nאִלּוּ נָתַן לָנוּ אֶת הַשַּׁבָּת, דַּיֵּנוּ!', transliteration: 'Ilu hotzI\'anu mi\'Mitzrayim, Dayenu!', english: 'Had He only taken us out of Egypt — it would have been enough!' },
    { id: 'pesach-matzah-maror', order: 11, title: 'Pesach, Matzah, Maror', titleHebrew: 'פֶּסַח מַצָּה וּמָרוֹר', hebrew: 'כָּל שֶׁלֹּא אָמַר שְׁלֹשָׁה דְּבָרִים אֵלּוּ בַּפֶּסַח, לֹא יָצָא יְדֵי חוֹבָתוֹ.', english: 'Whoever has not mentioned these three — Pesach, Matzah, and Maror — has not fulfilled their obligation.' },
    { id: 'hallel-part1', order: 12, title: 'Hallel', titleHebrew: 'הַלֵּל', hebrew: 'הַלְלוּיָהּ, הַלְלוּ עַבְדֵי יְיָ, הַלְלוּ אֶת שֵׁם יְיָ.', transliteration: 'Halleluyah! Praise the name of God.', english: 'Praise God who raises the poor from the dust and lifts the needy from the ash heap.' },
    { id: 'shulchan-orech', order: 13, title: 'The Meal 🍽️', titleHebrew: 'שֻׁלְחָן עוֹרֵךְ', hebrew: 'אוֹכְלִים וְשׁוֹתִים לְשֹׂבַע.', english: '🍽️ Time to eat! Enjoy the Seder feast together. Beshaat tov u\'mutzlach!' },
    { id: 'tzafun', order: 14, title: 'Tzafun — Afikomen', titleHebrew: 'צָפוּן', hebrew: 'מוֹצִיאִים אֶת הָאֲפִיקוֹמָן וְאוֹכְלִים אוֹתוֹ.', english: '🔍 Children search for the hidden Afikomen! Find it and negotiate your prize!' },
    { id: 'barech', order: 15, title: 'Barech', titleHebrew: 'בָּרֵךְ', hebrew: 'בָּרוּךְ אַתָּה יְיָ, הַזָּן אֶת הַכֹּל.', english: 'We thank God for the food we have eaten. We pour the third cup of wine.' },
    { id: 'elijah', order: 16, title: "Elijah's Cup", titleHebrew: 'כּוֹס אֵלִיָּהוּ', hebrew: 'פּוֹתְחִים אֶת הַדֶּלֶת לְאֵלִיָּהוּ הַנָּבִיא.', english: '🚪 Open the door for Elijah the Prophet! We pour his special cup of wine.', hasVote: true, voteQuestion: "Did the wine in Elijah's cup move? 👀" },
    { id: 'hallel-song', order: 17, title: 'Songs of Hallel', titleHebrew: 'שִׁיר הַהַלֵּל', hebrew: 'הוֹדוּ לַייָ כִּי טוֹב, כִּי לְעוֹלָם חַסְדּוֹ.', transliteration: "Hodu l'Adonai ki tov, ki l'olam chasdo.", english: "Give thanks to God, for He is good — His love endures forever." },
    { id: 'nirtzah', order: 18, title: 'Nirtzah', titleHebrew: 'נִרְצָה', hebrew: 'חֲסַל סִדּוּר פֶּסַח כְּהִלְכָתוֹ. לְשָׁנָה הַבָּאָה בִּירוּשָׁלָיִם!', transliteration: "Chasal siddur Pesach k'hilchato. L'shanah haba'ah b'Yerushalayim!", english: "The Seder is complete. Next year in Jerusalem! 🕊️", hasVote: true, voteQuestion: 'Who was the best Seder guest tonight? 🏆' },
    { id: 'chad-gadya', order: 19, title: 'Chad Gadya', titleHebrew: 'חַד גַּדְיָא', hebrew: 'חַד גַּדְיָא, חַד גַּדְיָא. דְּזַבִּין אַבָּא בִּתְרֵי זוּזֵי.', transliteration: 'Chad gadya, chad gadya. D\'zabin abba bitrei zuzei.', english: 'One little goat! A chaotic, joyful song to end the Seder. 🐐' },
];

export default function ReaderPage() {
    const params = useParams();
    const router = useRouter();
    const roomId = (params.roomId as string).toUpperCase();

    const [room, setRoom] = useState<Room | null>(null);
    const [latestImage, setLatestImage] = useState<GeneratedImage | null>(null);
    const [showImage, setShowImage] = useState(false);
    const [activeVote, setActiveVote] = useState<Vote | null>(null);
    const [myVoteChoice, setMyVoteChoice] = useState('');
    const [wakeLocked, setWakeLocked] = useState(false);

    const participantId = typeof window !== 'undefined' ? sessionStorage.getItem(`participant_${roomId}`) : null;

    // Wake Lock to keep screen on
    useEffect(() => {
        if (!('wakeLock' in navigator)) return;
        let lock: WakeLockSentinel;
        (navigator.wakeLock as WakeLock).request('screen').then((l) => {
            lock = l;
            setWakeLocked(true);
        }).catch(() => { });
        return () => { lock?.release(); };
    }, []);

    // Firestore listener for real-time sync
    useEffect(() => {
        const unsub = onSnapshot(doc(db, 'rooms', roomId), (snap) => {
            if (!snap.exists()) return;
            const data = snap.data() as Room;
            const prev = room;
            setRoom(data);

            // Show newest image if a new one arrived for current section
            const currentSection = SECTIONS[data.currentSectionIndex];
            const images = data.generatedImages.filter((img) => img.sectionId === currentSection?.id);
            if (images.length > 0) {
                const newest = images[images.length - 1];
                if (!prev || newest.id !== prev.generatedImages[prev.generatedImages.length - 1]?.id) {
                    setLatestImage(newest);
                    setShowImage(true);
                }
            }

            // Check for open vote
            const openVote = data.votes.find((v) => v.status === 'open');
            setActiveVote(openVote || null);

            if (data.status === 'finished') {
                router.replace(`/room/${roomId}/gallery`);
            }
        });
        return () => unsub();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [roomId]);

    const castVote = useCallback(async (choiceParticipantId: string) => {
        if (!activeVote || !participantId) return;
        setMyVoteChoice(choiceParticipantId);
        await fetch(`${BACKEND}/api/rooms/${roomId}/vote`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ voteId: activeVote.id, participantId, choiceParticipantId }),
        });
    }, [activeVote, participantId, roomId]);

    const section = SECTIONS[room?.currentSectionIndex ?? 0];
    const progress = room ? ((room.currentSectionIndex + 1) / SECTIONS.length) * 100 : 0;

    return (
        <main style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', maxWidth: 600, margin: '0 auto' }}>
            {/* Top Bar */}
            <div style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(212,168,71,0.15)', flexShrink: 0 }}>
                <span style={{ fontSize: '1.2rem' }}>🕍</span>
                <div className="progress-bar-outer" style={{ flex: 1, margin: '0 12px' }}>
                    <div className="progress-bar-inner" style={{ width: `${progress}%` }} />
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {wakeLocked && <span title="Screen stays on" style={{ fontSize: '0.7rem', color: 'var(--green-soft)' }}>🔆</span>}
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{(room?.currentSectionIndex ?? 0) + 1}/{SECTIONS.length}</span>
                </div>
            </div>

            {/* Section Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px 20px 32px' }}>
                {section ? (
                    <div className="animate-fade-in" key={section.id}>
                        {/* Order badge */}
                        <span className="badge badge-gold" style={{ marginBottom: 12, display: 'inline-flex' }}>
                            {section.order}. {section.title}
                        </span>

                        {/* Hebrew Title */}
                        <h1 className="section-title-hebrew" style={{ marginBottom: 20 }}>
                            {section.titleHebrew}
                        </h1>

                        <hr className="gold-divider" style={{ margin: '0 0 24px' }} />

                        {/* Hebrew Text */}
                        <p className="haggadah-hebrew" style={{ marginBottom: 16, whiteSpace: 'pre-line' }}>
                            {section.hebrew}
                        </p>

                        {/* Transliteration */}
                        {section.transliteration && (
                            <p className="haggadah-transliteration" style={{ marginBottom: 12, whiteSpace: 'pre-line' }}>
                                {section.transliteration}
                            </p>
                        )}

                        {/* English */}
                        <p className="haggadah-english" style={{ whiteSpace: 'pre-line' }}>
                            {section.english}
                        </p>

                        {/* Scratch hint */}
                        {section.hasScratch && (
                            <div className="card-gold" style={{ marginTop: 24, textAlign: 'center' }}>
                                <p style={{ fontSize: '0.9rem', color: 'var(--gold-light)' }}>🪶 Ten plagues — drop a dot of wine for each!</p>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 12 }}>
                                    {['🩸 Blood', '🐸 Frogs', '🦟 Lice', '🦁 Wild Animals', '🐄 Cattle', '🤕 Boils', '🌨️ Hail', '🦗 Locusts', '🌑 Darkness', '💔 Firstborn'].map((p) => (
                                        <span key={p} className="badge badge-gold">{p}</span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <p style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: 40 }}>Loading…</p>
                )}
            </div>

            {/* Voting Panel */}
            {activeVote && (
                <div style={{ padding: '16px 20px', borderTop: '1px solid rgba(212,168,71,0.15)', background: 'rgba(15,32,64,0.9)', backdropFilter: 'blur(12px)' }}>
                    <p style={{ color: 'var(--gold)', fontWeight: 600, marginBottom: 12, textAlign: 'center' }}>{activeVote.question}</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {activeVote.choices.map((choice) => {
                            const totalVotes = activeVote.choices.reduce((a, c) => a + c.votes.length, 0);
                            const pct = totalVotes > 0 ? (choice.votes.length / totalVotes) * 100 : 0;
                            const isSelected = myVoteChoice === choice.participantId;
                            return (
                                <button
                                    key={choice.participantId}
                                    className={`vote-choice${isSelected ? ' selected' : ''}`}
                                    onClick={() => castVote(choice.participantId)}
                                    id={`vote-${choice.participantId}`}
                                >
                                    <span style={{ fontSize: '0.85rem', flex: 1, textAlign: 'left' }}>{choice.label}</span>
                                    <div className="vote-bar">
                                        <div className="vote-bar-fill" style={{ width: `${pct}%` }} />
                                    </div>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', minWidth: 24 }}>{choice.votes.length}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Scene Image Overlay */}
            {showImage && latestImage && (
                <div className="scene-overlay" onClick={() => setShowImage(false)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setShowImage(false)}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={latestImage.imageUrl} alt="AI Scene" className="scene-image" />
                    <p style={{ position: 'absolute', bottom: 24, color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem' }}>Tap to continue</p>
                </div>
            )}
        </main>
    );
}

// WakeLock type fix
interface WakeLockSentinel { release(): Promise<void>; }
interface WakeLock { request(type: 'screen'): Promise<WakeLockSentinel>; }
