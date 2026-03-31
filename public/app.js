// --- Invitation Slideshow ---
(function initInvitationSlideshow() {
    const SLIDE_DURATION_MS = 6000; // time each image stays on screen
    const FADE_MS           = 1600; // must match CSS transition duration
    const KB_CLASSES        = ['kb1','kb2','kb3','kb4','kb5','kb6','kb7','kb8'];

    // Candidate image URLs — options first (highest quality), fallback to single bg
    const CANDIDATES = [
        ...Array.from({ length: 8 }, (_, i) => `/images/invitation-option-${i + 1}.jpg`),
        '/images/invitation-bg.jpg',
    ];

    let slides  = [];
    let current = 0;
    let timer   = null;

    function tryLoad(urls) {
        return Promise.all(
            urls.map(url => new Promise(resolve => {
                const img = new Image();
                img.onload  = () => resolve(url);
                img.onerror = () => resolve(null);
                img.src = url;
            }))
        ).then(results => results.filter(Boolean));
    }

    function buildSlides(urls) {
        const container = document.getElementById('inv-slideshow');
        if (!container || urls.length === 0) return;

        container.innerHTML = '';
        slides = urls.map((url, i) => {
            const img = document.createElement('img');
            img.src       = url;
            img.className = `inv-slide ${KB_CLASSES[i % KB_CLASSES.length]}`;
            img.style.setProperty('--kb-dur', SLIDE_DURATION_MS + 'ms');
            img.alt       = '';
            container.appendChild(img);
            return img;
        });

        showSlide(0);
    }

    function showSlide(index) {
        if (slides.length === 0) return;
        current = ((index % slides.length) + slides.length) % slides.length;

        slides.forEach((s, i) => {
            if (i === current) {
                // Restart Ken Burns animation
                s.style.animation = 'none';
                void s.offsetWidth; // reflow
                const kb = KB_CLASSES[current % KB_CLASSES.length];
                s.className = `inv-slide ${kb} active`;
                s.style.setProperty('--kb-dur', SLIDE_DURATION_MS + 'ms');
                s.style.animation = '';
            } else {
                s.classList.remove('active');
            }
        });

        if (timer) clearTimeout(timer);
        if (slides.length > 1) {
            timer = setTimeout(() => showSlide(current + 1), SLIDE_DURATION_MS);
        }
    }

    // Start: probe which images exist, then build slideshow
    function start() {
        tryLoad(CANDIDATES).then(available => {
            if (available.length === 0) return; // nothing to show
            buildSlides(available);
        });
    }

    // Expose so showScreen('invitation') can (re)start it
    window._startInvitationSlideshow = start;
})();

// --- State ---
let socket;
let pendingRoomId = null;
let selfieDataUrl = null;
let me = null;
let currentRoomId = null;
let currentPage = 0;
const pageImages = {};  // { [pageIndex]: imageUrl } — grows as AI generates images
let roomState = null;
let currentVersion = null; // Will be set on first checkVersion() call
let wakeLock = null;
let exodusMap = null;
let rsvpFlow = null;
let sederLabel = ''; // Host-set seder location label
let _lobbyCountdownInterval = null;

// --- Staging State ---
let isFollowingLeader = true;
let leaderId = null;
let leaderName = null;
let leaderPage = 0;
let currentLanguage = 'he'; // 'he' or 'translit'
let highlightedSegmentIndex = -1;
let amReading = false;
let activeReaders = [];

// Test mode flag — set by /api/config when server runs with TEST_MODE=1
let TEST_MODE = false;

// Leadership is open — anyone who clicked "Take Lead" is the leader (no email restriction)
function amIAllowedLeader() {
    return !!(socket && leaderId && leaderId === socket.id);
}

// --- Giggle Easter Egg (שָׁדַיִם) ---
// Matches shin-dalet-yod-(yod)-mem-sofit with any nikkud in between
const _NIK = '[\u05B0-\u05BD\u05BF\u05C1\u05C2\u05BC]*';
const GIGGLE_RE = new RegExp(
    '\u05E9' + _NIK + '\u05D3' + _NIK + '\u05D9' + _NIK + '\u05D9?' + _NIK + '\u05DD', 'g'
);

function wrapGiggleWords(html) {
    // Convert \n\n (verse breaks, e.g. Dayenu) to visible line breaks before other processing
    const withBreaks = html.replace(/\n\n+/g, '<br/><br/>').replace(/\n/g, '<br/>');
    return withBreaks.replace(GIGGLE_RE, '<span class="giggle-word" onclick="playGiggle(event)">$&</span>');
}

const _giggleMessages = [
    '😂 שָׁדַיִם!!! זה מהתנ"ך, בסדר?',
    '🫣 יחזקאל פרק ט"ז פסוק ז\'... 😅',
    '🎉 המילה הכי מצחיקה בהגדה!',
    '😂 הנביא ידע מה הוא עושה'
];
let _giggleSoundLoaded = false;
let _giggleAudio = null;

function playGiggle(event) {
    event.stopPropagation();
    const span = event.currentTarget;
    span.classList.remove('giggle-playing');
    void span.offsetWidth; // force reflow to restart animation
    span.classList.add('giggle-playing');
    span.addEventListener('animationend', () => span.classList.remove('giggle-playing'), { once: true });

    if (!_giggleAudio) {
        _giggleAudio = new Audio('https://assets.mixkit.co/active_storage/sfx/2020/2020-preview.mp3');
    }
    _giggleAudio.currentTime = 0;
    _giggleAudio.play().catch(() => {});

    const msg = _giggleMessages[Math.floor(Math.random() * _giggleMessages.length)];
    showToast(msg);
}
window.playGiggle = playGiggle;

// --- Hebrew to Latin Transliteration ---
function transliterate(hebrewHtml) {
    const text = hebrewHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    // Replace God's name before processing
    let src = text.replace(/יְיָ/g, 'Adonai').replace(/יהוה/g, 'Adonai');
    let out = '';
    let i = 0;

    while (i < src.length) {
        const c = src.charCodeAt(i);

        // Hebrew consonant (U+05D0–U+05EA)
        if (c >= 0x05D0 && c <= 0x05EA) {
            let v = '', dag = false, shinD = false, sinD = false, j = i + 1;

            // Collect nikkud marks following this consonant
            while (j < src.length) {
                const n = src.charCodeAt(j);
                if      (n === 0x05B0) { if (!v) v = 'e'; j++; } // shva
                else if (n === 0x05B1) { v = 'e'; j++; }  // hataf segol
                else if (n === 0x05B2) { v = 'a'; j++; }  // hataf patach
                else if (n === 0x05B3) { v = 'o'; j++; }  // hataf kamatz
                else if (n === 0x05B4) { v = 'i'; j++; }  // hiriq
                else if (n === 0x05B5) { v = 'e'; j++; }  // tsere
                else if (n === 0x05B6) { v = 'e'; j++; }  // segol
                else if (n === 0x05B7) { v = 'a'; j++; }  // patach
                else if (n === 0x05B8) { v = 'a'; j++; }  // kamatz
                else if (n === 0x05B9) { v = 'o'; j++; }  // holam
                else if (n === 0x05BA) { v = 'o'; j++; }  // holam haser
                else if (n === 0x05BB) { v = 'u'; j++; }  // kubutz
                else if (n === 0x05BC) { dag = true; j++; } // dagesh
                else if (n === 0x05BD || n === 0x05BF) { j++; } // meteg/rafe
                else if (n === 0x05C1) { shinD = true; j++; } // shin dot
                else if (n === 0x05C2) { sinD = true; j++; } // sin dot
                else break;
            }

            // Silence shva at end of word
            if (v === 'e') {
                let endOfWord = true;
                for (let look = j; look < src.length; look++) {
                    const lc = src.charCodeAt(look);
                    if (lc >= 0x05D0 && lc <= 0x05EA) { endOfWord = false; break; }
                    if ((lc >= 0x05B0 && lc <= 0x05C2) || lc === 0x05BF) continue;
                    break;
                }
                if (endOfWord) v = '';
            }

            let k = '';
            switch (c) {
                case 0x05D0: k = ''; break;                     // alef (silent)
                case 0x05D1: k = dag ? 'b' : 'v'; break;       // bet/vet
                case 0x05D2: k = 'g'; break;                    // gimel
                case 0x05D3: k = 'd'; break;                    // dalet
                case 0x05D4: k = 'h'; break;                    // he
                case 0x05D5:                                      // vav
                    if (dag && !v) { k = ''; v = 'u'; }         // shuruq
                    else if (v === 'o') k = '';                  // holam male
                    else k = 'v';
                    break;
                case 0x05D6: k = 'z'; break;                    // zayin
                case 0x05D7: k = 'ch'; break;                   // chet
                case 0x05D8: k = 't'; break;                    // tet
                case 0x05D9: k = 'y'; break;                    // yod
                case 0x05DA: case 0x05DB: k = dag ? 'k' : 'kh'; break; // kaf
                case 0x05DC: k = 'l'; break;                    // lamed
                case 0x05DD: case 0x05DE: k = 'm'; break;       // mem
                case 0x05DF: case 0x05E0: k = 'n'; break;       // nun
                case 0x05E1: k = 's'; break;                    // samekh
                case 0x05E2: k = ''; break;                     // ayin (silent)
                case 0x05E3: k = 'f'; break;                    // final pe
                case 0x05E4: k = dag ? 'p' : 'f'; break;       // pe/fe
                case 0x05E5: case 0x05E6: k = 'tz'; break;     // tsadi
                case 0x05E7: k = 'k'; break;                    // qof
                case 0x05E8: k = 'r'; break;                    // resh
                case 0x05E9: k = sinD ? 's' : 'sh'; break;     // shin/sin
                case 0x05EA: k = 't'; break;                    // tav
            }

            out += k + v;
            i = j;
        } else if (c === 0x05BE) { // maqaf (Hebrew hyphen)
            out += '-';
            i++;
        } else if ((c >= 0x05B0 && c <= 0x05BD) || c === 0x05BF || c === 0x05C1 || c === 0x05C2 || c === 0x05F3 || c === 0x05F4) {
            i++; // skip standalone nikkud / geresh
        } else {
            out += src[i];
            i++;
        }
    }

    return out;
}

// --- DOM refs ---
const $$ = id => document.getElementById(id);

const screens = {
    invitation: $$('invitation-screen'),
    lobby: $$('lobby-screen'),
    rsvp: $$('rsvp-screen'),
    roomLobby: $$('room-lobby-screen'),
    room: $$('room-screen'),
    gallery: $$('gallery-screen')
};

let roomTasks = [];

function safeAddListener(id, event, fn) {
    const el = $$(id);
    if (el) el.addEventListener(event, fn);
}

// --- Photo Helpers ---
// Returns true if 'photo' is an emoji/text icon rather than an image URL/dataURL
function isEmojiPhoto(photo) {
    if (!photo) return false;
    return !photo.startsWith('data:') && !photo.startsWith('http') && !photo.startsWith('/') && !photo.startsWith('blob:');
}

// Creates the right DOM element for an avatar — <img> for real photos, <div> for emojis
function createAvatarEl(photoUrl) {
    if (isEmojiPhoto(photoUrl)) {
        const div = document.createElement('div');
        div.className = 'emoji-avatar';
        div.textContent = photoUrl;
        return div;
    }
    const img = document.createElement('img');
    img.src = photoUrl;
    img.alt = '';
    img.onerror = function() { this.style.display = 'none'; };
    return img;
}

// --- Init ---
function init() {
    const navType = performance.getEntriesByType('navigation')[0]?.type;
    console.log(`[Init] App starting... (Navigation: ${navType}, Time: ${Date.now()})`);

    setupSocket();
    setupTasks();
    requestWakeLock();

    // Check for test mode
    fetch('/api/config').then(r => r.json()).then(cfg => {
        if (cfg.testMode) {
            TEST_MODE = true;
            console.log('[TEST_MODE] Test mode active — showing test login buttons');
            const testLogin = document.getElementById('test-mode-login');
            const normalAuth = document.getElementById('normal-auth');
            if (testLogin) testLogin.classList.remove('hidden');
            if (normalAuth) normalAuth.classList.add('hidden');
        }
    }).catch(e => console.warn('[Config] Could not fetch config:', e));

    // Initialize Exodus Map
    exodusMap = new ExodusMap('exodus-map-root');

    // Initialize RSVP Flow
    rsvpFlow = new RSVPFlow({
        onComplete: (data) => {
            console.log('[RSVP] Flow complete:', data);

            // Ensure me has name from RSVP
            if (!me || !me.name) {
                const guestName = data.name || 'אורח ' + Math.floor(Math.random() * 900 + 100);
                me = { name: guestName, isGuest: true };
                localStorage.setItem('haggadah-user', JSON.stringify(me));
            } else if (data.name && me.isGuest) {
                me.name = data.name;
                localStorage.setItem('haggadah-user', JSON.stringify(me));
            }

            if (currentRoomId) {
                // Updating existing profile
                socket.emit('update-profile', { roomId: currentRoomId, photo: data.photo });
                showScreen('roomLobby');
            } else if (pendingRoomId) {
                // Join room, then show finish screen with participants + countdown
                joinRoomAndShowFinish(pendingRoomId, data);
            } else {
                showScreen('lobby');
                showToast('הפרופיל נשמר! כדי להצטרף לסדר, פתחו קישור מהמארח 🔗');
            }
        }
    });

    // Register PWA Service Worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').then(reg => {
            console.log('[SW] Registered', reg.scope);
        }).catch(err => {
            console.warn('[SW] Registration failed:', err);
        });
    }

    // Start version polling
    checkVersion();
    setInterval(checkVersion, 60000); // Check every minute

    // Add event listeners (Safely)
    // --- Invitation screen ---
    safeAddListener('btn-inv-yes', 'click', () => {
        // User accepted invitation → proceed to RSVP (name + selfie)
        rsvpFlow.show();
    });
    safeAddListener('btn-inv-no', 'click', () => {
        // User declined — show the "we'll miss you" note
        const invWrap = $$('invitation-screen').querySelector('.inv-card');
        const rsvp    = $$('invitation-screen').querySelector('.inv-rsvp');
        if (invWrap) invWrap.style.display = 'none';
        if (rsvp)    rsvp.style.display    = 'none';
        const noMsg = $$('inv-no-msg');
        if (noMsg) noMsg.classList.remove('hidden');
    });

    safeAddListener('btn-create-room', 'click', onCreateRoom);
    safeAddListener('btn-create-room-returning', 'click', onCreateRoomReturning);
    safeAddListener('btn-switch-user', 'click', onSignOut);
    safeAddListener('btn-take-selfie', 'click', onTakeSelfie);
    safeAddListener('btn-retake', 'click', onRetake);
    safeAddListener('btn-guest-login', 'click', () => {
        // Guest login only makes sense if there's a room link to join
        if (!pendingRoomId) {
            showToast('כדי להצטרף, פתחו קישור שקיבלתם מהמארח 🔗');
            return;
        }
        rsvpFlow.show();
    });
    safeAddListener('btn-join-with-photo', 'click', onJoinWithPhoto);
    safeAddListener('btn-copy-link', 'click', onCopyLink);
    safeAddListener('btn-prev', 'click', () => changePage(-1));
    safeAddListener('btn-next', 'click', () => changePage(1));
    safeAddListener('btn-read-along', 'click', toggleReading);
    safeAddListener('btn-lang-toggle', 'click', toggleLanguage);
    safeAddListener('btn-sync', 'click', onSyncWithLeader);
    safeAddListener('btn-sync-menu', 'click', onSyncWithLeader);
    safeAddListener('btn-edit-profile', 'click', () => rsvpFlow.show(true));
    safeAddListener('btn-sign-out-room', 'click', onSignOut);
    safeAddListener('btn-menu', 'click', toggleMenu);
    safeAddListener('btn-sign-out', 'click', onSignOut);
    safeAddListener('btn-sign-out-global', 'click', onSignOut);
    safeAddListener('btn-toggle-tasks', 'click', () => {
        toggleTasks();
        if (!$$('room-menu').classList.contains('hidden')) toggleMenu();
    });
    safeAddListener('btn-close-tasks', 'click', toggleTasks);
    safeAddListener('btn-add-task', 'click', addTask);
    safeAddListener('btn-start-seder', 'click', onStartSeder);
    safeAddListener('btn-start-seder-top', 'click', onStartSeder);
    safeAddListener('seder-label-input', 'input', (e) => {
        const label = e.target.value;
        sederLabel = label;
        if (socket && currentRoomId) socket.emit('set-seder-label', { roomId: currentRoomId, label });
        updateSederLabelDisplay(label);
    });
    safeAddListener('btn-save-guest-list', 'click', () => {
        const ta = $$('guest-list-ta');
        if (!ta) return;
        const names = ta.value.split('\n').map(n => n.trim()).filter(Boolean);
        socket.emit('set-guest-list', { roomId: currentRoomId, names }, (res) => {
            if (res?.success) showToast(`✓ ${res.count} אורחים נשמרו ברשימה 📋`);
            else showToast('שגיאה בשמירה ❌');
        });
    });

    // Pre-register participant functions (exposed globally for inline onclick)
    window.previewPreregPhoto = function(input) {
        const file = input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = e => {
            const preview = $$('prereg-photo-preview');
            const img = $$('prereg-preview-img');
            if (preview && img) {
                img.src = e.target.result;
                preview.style.display = 'block';
            }
        };
        reader.readAsDataURL(file);
    };

    window.loadAllSelfies = async function() {
        if (!currentRoomId) { showToast('אין חדר פעיל'); return; }
        showToast('טוען תמונות...');
        try {
            // First try bulk copy from previous rooms (server-side, efficient)
            const allRes = await fetch('/api/all-selfies');
            const { participants } = await allRes.json();

            if (!participants?.length) {
                showToast('לא נמצאו תמונות בהיסטוריה');
                return;
            }

            let added = 0;
            for (const p of participants) {
                const inRoom = currentParticipants?.find(cp =>
                    cp.photo && cp.photo.substring(0,100) === p.photo.substring(0,100));
                if (inRoom) continue;
                await fetch('/api/pre-register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ roomId: currentRoomId, name: p.name, photo: p.photo })
                });
                added++;
            }
            showToast(`✓ נטענו ${added} משתתפים`);
            const r2 = await fetch(`/api/pre-register?roomId=${currentRoomId}`);
            const d2 = await r2.json();
            renderPreregList(d2.participants || []);
        } catch(e) {
            console.error('[loadAllSelfies]', e);
            showToast('שגיאה בטעינה: ' + e.message);
        }
    };

    window.addPreregisteredParticipant = async function() {
        const nameEl = $$('prereg-name');
        const photoEl = $$('prereg-photo');
        const name = nameEl?.value?.trim();
        if (!name) { showToast('הכנס שם לאורח'); return; }
        if (!currentRoomId) { showToast('אין חדר פעיל'); return; }

        // Resize photo to ~200px for efficiency
        let photoData = null;
        const file = photoEl?.files[0];
        if (file) {
            photoData = await new Promise(resolve => {
                const img = new Image();
                const url = URL.createObjectURL(file);
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const size = Math.min(img.width, img.height, 200);
                    canvas.width = size; canvas.height = size;
                    const ctx = canvas.getContext('2d');
                    const sx = (img.width - size) / 2, sy = (img.height - size) / 2;
                    ctx.drawImage(img, sx, sy, size, size, 0, 0, size, size);
                    URL.revokeObjectURL(url);
                    resolve(canvas.toDataURL('image/jpeg', 0.7));
                };
                img.src = url;
            });
        }

        const res = await fetch('/api/pre-register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roomId: currentRoomId, name, photo: photoData })
        });
        const data = await res.json();
        if (data.success) {
            showToast(`✓ ${name} נוסף/ה לסדר`);
            renderPreregList(data.participants);
            if (nameEl) nameEl.value = '';
            if (photoEl) photoEl.value = '';
            const preview = $$('prereg-photo-preview');
            if (preview) preview.style.display = 'none';
        } else {
            showToast('שגיאה: ' + (data.error || 'נסה שוב'));
        }
    };

    window.removePreregisteredParticipant = async function(name) {
        if (!currentRoomId) return;
        await fetch('/api/pre-register', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roomId: currentRoomId, name })
        });
        const r = await fetch(`/api/pre-register?roomId=${currentRoomId}`);
        const d = await r.json();
        renderPreregList(d.participants || []);
    };

    safeAddListener('btn-claim-lead-pin', 'click', () => {
        const pin = $$('leader-pin-input')?.value?.trim();
        if (!pin) { showToast('נא להזין קוד מנחה 🔑'); return; }
        socket.emit('claim-lead-with-pin', { roomId: currentRoomId, pin }, (res) => {
            if (res?.success) {
                showToast('ברוך הבא מנחה! 👑');
                const box = $$('lobby-host-login');
                if (box) box.style.display = 'none';
            } else {
                showToast('קוד שגוי ❌');
            }
        });
    });

    safeAddListener('btn-lobby-copy-link', 'click', onCopyLink);
    safeAddListener('btn-lobby-share', 'click', () => {
        const url = window.location.origin + '?room=' + currentRoomId;
        const msg =
            `🍷 *פסח יחד 2026!* 🌊\n\n` +
            `הצטרפו לסדר הפסח המשותף שלנו!\n\n` +
            `📸 לחצו על הקישור, צלמו סלפי ותראו מי עוד מגיע לסדר 😄\n\n` +
            `👇 הצטרפו כאן:\n${url}\n\n` +
            `חג פסח שמח! 🎉`;
        const wa = `https://wa.me/?text=${encodeURIComponent(msg)}`;
        window.open(wa, '_blank');
    });
    safeAddListener('btn-end-seder', 'click', onEndSeder);
    safeAddListener('btn-gallery-open', 'click', () => { showGallery(); toggleMenu(); });
    safeAddListener('btn-feedback-open', 'click', () => { showFeedback(); toggleMenu(); });

    const lockCheckEl = $$('check-lock-page');
    if (lockCheckEl) {
        lockCheckEl.addEventListener('change', () => {
            socket.emit('set-page-lock', { roomId: currentRoomId, locked: lockCheckEl.checked });
        });
    }

    // Lead-mode checkbox — hidden; leadership now requires PIN via claim-lead-with-pin
    // (kept for sync toggle only — does not grant leadership)

    // Test mode buttons
    safeAddListener('btn-test-host', 'click', () => {
        socket.emit('test-login', { role: 'host' }, (res) => {
            if (res?.error) return showToast(res.error);
            console.log('[TEST] Host login response:', res);
        });
    });
    safeAddListener('btn-test-guest', 'click', () => {
        socket.emit('test-login', { role: 'guest' }, (res) => {
            if (res?.error) return showToast(res.error);
            console.log('[TEST] Guest login response:', res);
        });
    });

    const inputNewTask = $$('input-new-task');
    if (inputNewTask) {
        inputNewTask.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') addTask();
        });
    }

    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
        const menu = $$('room-menu');
        const btn = $$('btn-menu');
        if (menu && !menu.classList.contains('hidden') && !menu.contains(e.target) && !btn.contains(e.target)) {
            toggleMenu();
        }
    });


    // --- Global Reset / Version Control ---
    const lastSeenVersion = localStorage.getItem('haggadah_app_version');
    if (lastSeenVersion && lastSeenVersion !== currentVersion && lastSeenVersion < '1.0.1740') {
        console.warn(`[Reset] Version mismatch (${lastSeenVersion} -> ${currentVersion}). Forcing logout...`);
        localStorage.clear();
        location.reload();
        return;
    }
    localStorage.setItem('haggadah_app_version', currentVersion);

    // Auto-login from storage — prioritize Google credential over guest session
    const savedGoogleCred = localStorage.getItem('haggadah-google-cred');
    const storedUser = localStorage.getItem('haggadah-user');
    
    if (storedUser) {
        me = JSON.parse(storedUser);
        console.log('[Auth] Restored user:', me.name);
    }
    
    // If we have a saved Google credential, decode it to ensure email is available
    if (savedGoogleCred) {
        try {
            // Decode the JWT payload (middle part)
            const payload = JSON.parse(atob(savedGoogleCred.split('.')[1]));
            if (payload.email) {
                // Override the stored user with the Google account info
                // This ensures me.email is always set if Oren previously logged in
                me = {
                    id: payload.sub,
                    name: payload.name || me?.name || 'אורן',
                    email: payload.email,
                    picture: payload.picture,
                    isGuest: false
                };
                localStorage.setItem('haggadah-user', JSON.stringify(me));
                console.log('[Auth] Restored Google user from credential:', me.email);
            }
        } catch(e) {
            console.warn('[Auth] Failed to decode saved credential:', e);
        }
    }
    
    if (me) {
        const authSection = document.getElementById('lobby-auth-section');
        const actionsSection = document.getElementById('lobby-actions-section');
        if (authSection) authSection.classList.add('hidden');
        if (actionsSection) actionsSection.classList.remove('hidden');
    }


    // Initial check for room in URL
    const urlParams = new URLSearchParams(window.location.search);
    const roomFromUrl = urlParams.get('room');
    const previewInvitation = urlParams.get('preview') === 'invitation';

    // Load persisted selfie
    const savedSelfie = localStorage.getItem('haggadah_selfie');
    if (savedSelfie) {
        selfieDataUrl = savedSelfie;
    }

    // Countdown to Seder: April 1 2026 18:30 AEDT (Sydney, UTC+11)
    function startSederCountdown() {
        const seder = new Date('2026-04-01T18:30:00+11:00');
        const pad = n => String(n).padStart(2, '0');
        function tick() {
            const diff = seder - Date.now();
            if (diff <= 0) {
                ['cd-days','cd-hours','cd-mins','cd-secs'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.textContent = '00';
                });
                return;
            }
            const days  = Math.floor(diff / 86400000);
            const hours = Math.floor((diff % 86400000) / 3600000);
            const mins  = Math.floor((diff % 3600000)  / 60000);
            const secs  = Math.floor((diff % 60000)    / 1000);
            const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = pad(v); };
            set('cd-days', days); set('cd-hours', hours); set('cd-mins', mins); set('cd-secs', secs);
            setTimeout(tick, 1000);
        }
        tick();
    }

    // Host photos: appear on tap anywhere in the hero, disappear 1s after touch ends
    function initHostPhotosTap() {
        const hero = document.querySelector('.inv-hero');
        const hostsRow = document.querySelector('.inv-hosts-row');
        if (!hero || !hostsRow) return;
        let hideTimer = null;
        function showHosts() {
            clearTimeout(hideTimer);
            hostsRow.classList.add('visible');
        }
        function scheduleHide() {
            clearTimeout(hideTimer);
            hideTimer = setTimeout(() => hostsRow.classList.remove('visible'), 1000);
        }
        hero.addEventListener('touchstart', showHosts,    { passive: true });
        hero.addEventListener('touchend',   scheduleHide, { passive: true });
        hero.addEventListener('mousedown',  showHosts);
        hero.addEventListener('mouseup',    scheduleHide);
    }

    // Helper: show invitation screen → video plays once → then Ken Burns slideshow loops
    function showInvitationScreen() {
        showScreen('invitation');
        startSederCountdown();
        initHostPhotosTap();
        const invVid = document.getElementById('inv-hero-video');
        const invSlide = document.getElementById('inv-slideshow');

        function startSlideshow() {
            if (invVid) invVid.style.display = 'none';
            if (invSlide) { invSlide.style.display = ''; }
            if (window._startInvitationSlideshow) window._startInvitationSlideshow();
        }

        if (invVid) {
            invVid.removeAttribute('loop');          // play once, then switch to slideshow
            invVid.addEventListener('ended', startSlideshow, { once: true });
            invVid.play().catch(startSlideshow);     // autoplay blocked → go straight to slideshow
        } else {
            startSlideshow();
        }
    }

    // ?preview=invitation → always show invitation (for host preview, no login needed)
    if (previewInvitation) {
        showInvitationScreen();
    } else if (roomFromUrl) {
        pendingRoomId = roomFromUrl;
        window._directHaggadahMode = true;
        // Skip everything — join silently and show first haggadah page immediately
        if (!me || !me.name) {
            me = { name: 'אורח', isGuest: true };
            localStorage.setItem('haggadah-user', JSON.stringify(me));
        }
        currentRoomId = roomFromUrl;
        currentPage = 0;
        showScreen('room');
        renderPage();
        // Join in background so sync works
        socket.emit('join-room', { roomId: roomFromUrl, name: me.name, photo: null }, (res) => {
            if (res && res.success) {
                currentRoomId = res.roomId;
                leaderId = res.leaderId;
                if (res.sederStarted && res.currentPage != null) {
                    currentPage = res.currentPage;
                    renderPage();
                }
                startHeartbeat(currentRoomId);
                updateLeadershipUI();
            }
        });
    } else {
        showScreen('lobby');
        if (me) {
            $$('lobby-auth-section').classList.add('hidden');
            const actSec = $$('lobby-actions-section');
            if (actSec) actSec.classList.remove('hidden');
            const nameEl = $$('lobby-user-name');
            if (nameEl) nameEl.textContent = me.name || '';
        } else {
            $$('lobby-auth-section').classList.remove('hidden');
            const actSec = $$('lobby-actions-section');
            if (actSec) actSec.classList.add('hidden');
        }
    }

    // Auto-hiding header logic
    let lastScrollY = 0;
    const roomHeader = document.querySelector('.room-header');
    const scrollContainer = document.querySelector('.haggadah-container');

    if (scrollContainer) {
        scrollContainer.addEventListener('scroll', () => {
            const currentScrollY = scrollContainer.scrollTop;
            if (currentScrollY > lastScrollY && currentScrollY > 100) {
                // Scrolling down - hide header
                roomHeader.classList.add('header-hidden');
            } else if (currentScrollY < lastScrollY) {
                // Scrolling up - show header
                roomHeader.classList.remove('header-hidden');
            }
            lastScrollY = currentScrollY;
        });
    }
}

async function setupSocket() {
    socket = io();

    // Show cold-start note after 8 seconds if still loading
    const coldNoteTimer = setTimeout(() => {
        const note = $$('loading-cold-note');
        if (note) note.style.display = 'block';
    }, 8000);

    socket.on('connect', () => {
        console.log('[Socket] Connected to server. Socket ID:', socket.id);
        clearTimeout(coldNoteTimer);
        // Hide loading screen
        const loadingScreen = $$('loading-screen');
        if (loadingScreen) loadingScreen.classList.add('hidden');

        // Auto-re-auth if we have a saved credential
        const savedCred = localStorage.getItem('haggadah-google-cred');
        if (savedCred) {
            console.log('[Auth] Found saved credential, syncing personality...');
            socket.emit('google-login', { credential: savedCred });
        }

        // If we were already in a room, re-join automatically to restore sync
        if (currentRoomId) {
            console.log('[Socket] Re-connecting... re-joining room:', currentRoomId);
            joinRoom(currentRoomId);
        }
    });


    socket.on('disconnect', (reason) => {
        console.warn('[Socket] Disconnected:', reason);
        if (reason === 'io server disconnect') {
            // the disconnection was initiated by the server, you need to reconnect manually
            socket.connect();
        }
    });

    socket.on('room-updated', (data) => {
        window._lastRoomData = Object.assign(window._lastRoomData || {}, data);
        checkForNewParticipants(data.participants || []);
        renderParticipants(data.participants);
        renderLobbyParticipants(data.participants);
        leaderId = data.leaderId;
        leaderName = data.leaderName;
        leaderPage = data.currentPage;

        updateLeadershipUI();
        updateLobbyUI(data.sederStarted);

        if (isFollowingLeader && data.currentPage != null && data.currentPage !== currentPage) {
            currentPage = data.currentPage;
            renderPage();
        }
    });

    socket.on('seder-started', (data) => {
        showScreen('room');
        currentPage = data.currentPage || 0;
        renderPage();
        showToast('🍷 הסדר מתחיל! חג שמח!');
        confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
        // Prompt DND mode + activate NoSleep
        setTimeout(() => showDNDPrompt(), 1800);
    });

    socket.on('leader-updated', (data) => {
        leaderId = data.leaderId;
        leaderName = data.leaderName;
        updateLeadershipUI();
        if (leaderId === socket.id) {
            showToast('אתה עכשיו עורך הסדר 👑');
        } else {
            showToast(`${leaderName} הוא עורך הסדר החדש`);
        }
    });

    socket.on('toast-broadcast', ({ message }) => {
        showToast(message);
    });

    socket.on('page-updated', ({ pageIndex, authorId }) => {
        leaderPage = pageIndex;
        if (authorId === leaderId || isFollowingLeader) {
            if (currentPage !== pageIndex) {
                currentPage = pageIndex;
                renderPage();
            }
        }
    });

    socket.on('effect-triggered', ({ effectType, authorId }) => {
        triggerLocalEffect(effectType);
    });

    socket.on('you-were-kicked', () => {
        showToast('הוצאת מהחדר על ידי המנחה 👋');
        setTimeout(() => {
            currentRoomId = null;
            window.location.href = '/';
        }, 2000);
    });

    socket.on('page-lock-updated', ({ locked }) => {
        const isLeader = amIAllowedLeader();
        const prevBtn = $$('btn-prev');
        const nextBtn = $$('btn-next');
        if (locked && !isLeader) {
            if (prevBtn) prevBtn.disabled = true;
            if (nextBtn) nextBtn.disabled = true;
            showToast('🔒 המנחה נעל את הניווט');
        } else {
            if (prevBtn) prevBtn.disabled = false;
            if (nextBtn) nextBtn.disabled = false;
            if (locked === false) showToast('🔓 הניווט פתוח שוב');
        }
    });

    socket.on('seder-ended', ({ images }) => {
        Object.assign(pageImages, images || {});
        showGallery();
    });

    socket.on('reactions-updated', (data) => onReactionsUpdated(data));

    socket.on('mi-yodea-updated', (data) => onMiYodeaUpdated(data));
    socket.on('mi-yodea-image-ready', (data) => onMiYodeaImageReady(data));

    socket.on('page-changed', (data) => {
        leaderPage = data.currentPage;
        if (isFollowingLeader) {
            currentPage = data.currentPage;
            renderPage();
            showToast(`המנחה עבר לעמוד ${currentPage + 1}`);
        } else {
            // Update UI to show we are out of sync
            renderPage();
        }
    });

    socket.on('tasks-updated', (data) => {
        const { tasks, completedTask } = data;
        roomTasks = tasks;
        renderTasks();
        if (completedTask) {
            showToast(`✅ משימה הושלמה: ${completedTask}`);
            confetti({
                particleCount: 150,
                spread: 70,
                origin: { y: 0.6 },
                colors: ['#8b4513', '#d4af37', '#fdfaf5']
            });
        }
    });

    socket.on('highlight-updated', (data) => {
        if (data.pageIndex === currentPage) {
            highlightedSegmentIndex = data.segmentIndex;
            applyHighlight(data.segmentIndex);
        } else {
            highlightedSegmentIndex = -1;
        }
    });

    socket.on('paragraphs-updated', ({ pageIndex, taps }) => {
        if (pageIndex === currentPage) renderParagraphAvatars(taps);
    });

    socket.on('readers-updated', ({ readers }) => {
        activeReaders = readers || [];
        // Update reading button appearance
        const readBtn = $$('btn-read-along');
        if (readBtn) {
            const iAmReading = activeReaders.some(r => r.id === socket.id);
            amReading = iAmReading;
            readBtn.classList.toggle('active', iAmReading);
            readBtn.title = iAmReading ? 'אתה קורא/ת — לחץ לביטול' : 'סמן שאני קורא/ת';
        }
        // Re-render to show/hide readers strip
        renderPage();
    });

    socket.on('image-ready', ({ pageIndex, imageUrl, featuredPhotos }) => {
        pageImages[pageIndex] = { url: imageUrl, featuredPhotos };
        if (pageIndex === currentPage) renderPage();
    });

    socket.on('ai-status', ({ message, pageIndex }) => {
        const overlay = document.getElementById(`status-overlay-${pageIndex}`);
        if (overlay) {
            overlay.classList.remove('hidden');
            overlay.classList.remove('error');
            overlay.querySelector('.status-text').innerText = 'מעבד...';
            overlay.querySelector('.status-log').innerText = message;
        }
    });

    socket.on('ai-error', ({ message, pageIndex }) => {
        const overlay = document.getElementById(`status-overlay-${pageIndex}`);
        if (overlay) {
            overlay.classList.remove('hidden');
            overlay.classList.add('error');
            overlay.querySelector('.status-text').innerText = 'שגיאה בייצור';
            overlay.querySelector('.status-log').innerText = message;
        }
        console.error('AI Error:', message);
    });

    socket.on('version-sync', ({ version }) => {
        console.log(`[Version] Server: ${version}, Client: ${currentVersion}`);
        if (!currentVersion) {
            currentVersion = version;
            return;
        }
        if (currentVersion !== version) {
            console.log('Version mismatch detected via Socket!');
            notifyNewVersion();
        }
    });

    socket.on('google-login-success', (userData) => {
        me = userData;
        localStorage.setItem('haggadah-user', JSON.stringify(me));
        showToast(`ברוך הבא, ${userData.name}!`);
        
        // Check if we were trying to join a room
        if (pendingRoomId) {
            rsvpFlow.show();
        } else {
            // Switch to actions (Create Room)
            const authSection = document.getElementById('lobby-auth-section');
            const actionsSection = document.getElementById('lobby-actions-section');
            if (authSection) authSection.classList.add('hidden');
            if (actionsSection) actionsSection.classList.remove('hidden');
        }

        // RE-SYNC: If we are already in a room, re-join now that we are authenticated
        // This ensures the server recognizes us as Oren (leader)
        if (currentRoomId) {
            console.log('[Auth] Re-joining room after login to sync leadership...');
            joinRoom(currentRoomId);
        }

        updateLeadershipUI();
    });

    socket.on('seder-label-updated', ({ label }) => {
        sederLabel = label;
        updateSederLabelDisplay(label);
    });
}

function updateSederLabelDisplay(label) {
    // Update the finish screen countdown label
    const finishLabel = $$('finish-countdown-label');
    if (finishLabel) {
        finishLabel.textContent = label
            ? `⏳ נתחיל את הסדר ${label} בעוד:`
            : '⏳ הסדר מתחיל בעוד:';
    }
    // Update the lobby guest note label
    const lobbyLabelEl = $$('lobby-seder-label-display');
    if (lobbyLabelEl) {
        if (label) {
            lobbyLabelEl.textContent = label;
            lobbyLabelEl.classList.remove('hidden');
        } else {
            lobbyLabelEl.classList.add('hidden');
        }
    }
}

function startLobbyCountdown() {
    const sederDate = new Date(2026, 3, 1, 19, 0, 0); // April 1, 2026 19:00
    const el = $$('lobby-mini-countdown');
    if (!el) return;

    function update() {
        const diff = sederDate - new Date();
        if (diff <= 0) {
            el.innerHTML = '<span>🍷 הסדר מתחיל עכשיו!</span>';
            clearInterval(_lobbyCountdownInterval);
            return;
        }
        const days = Math.floor(diff / 86400000);
        const hours = Math.floor((diff % 86400000) / 3600000);
        const mins = Math.floor((diff % 3600000) / 60000);
        let txt = '';
        if (days > 0) txt += `<span class="cd-num">${days}</span><span class="cd-unit">ימים</span>`;
        txt += `<span class="cd-num">${hours}</span><span class="cd-unit">שעות</span>`;
        txt += `<span class="cd-num">${mins}</span><span class="cd-unit">דקות</span>`;
        el.innerHTML = txt;
    }

    clearInterval(_lobbyCountdownInterval);
    update();
    _lobbyCountdownInterval = setInterval(update, 60000);
}

function triggerPageGeneration(pageIndex) {
    if (!currentRoomId) return;

    // --- Leader Check (Client Side) — AI generation restricted to current leader ---
    if (!amIAllowedLeader()) {
        showToast('רק עורך הסדר (המנחה) יכול להתחיל יצירת תמונה 👑');
        return;
    }

    const overlay = document.getElementById(`status-overlay-${pageIndex}`);
    if (overlay) {
        overlay.classList.remove('hidden');
        overlay.classList.remove('error');
        overlay.querySelector('.status-text').innerText = 'מתחיל...';
        overlay.querySelector('.status-log').innerText = 'שולח בקשה לשרת...';
    }
    socket.emit('generate-page', { roomId: currentRoomId, pageIndex });
}

// --- Wake Lock ---
let _noSleep = null;
let _noSleepActive = false;

async function requestWakeLock() {
    if (_noSleepActive) return;
    if (typeof NoSleep !== 'undefined') {
        try {
            if (!_noSleep) _noSleep = new NoSleep();
            await _noSleep.enable();
            _noSleepActive = true;
            return;
        } catch (e) { /* needs user gesture — will retry on first interaction */ }
    }
    if ('wakeLock' in navigator && location.protocol === 'https:') {
        try {
            wakeLock = await navigator.wakeLock.request('screen');
            wakeLock.addEventListener('release', () => {
                _noSleepActive = false;
                if (document.visibilityState === 'visible') requestWakeLock();
            });
            _noSleepActive = true;
        } catch (err) { /* silent */ }
    }
}

// Enable NoSleep on first user touch (required by browsers for video autoplay)
function _enableNoSleepOnGesture() {
    if (_noSleepActive) return;
    if (typeof NoSleep !== 'undefined') {
        if (!_noSleep) _noSleep = new NoSleep();
        _noSleep.enable().then(() => { _noSleepActive = true; }).catch(() => {});
    }
    document.removeEventListener('touchstart', _enableNoSleepOnGesture);
    document.removeEventListener('click', _enableNoSleepOnGesture);
}
document.addEventListener('touchstart', _enableNoSleepOnGesture, { once: true });
document.addEventListener('click', _enableNoSleepOnGesture, { once: true });

// Re-request on visibility change (only if wake lock was released)
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !_noSleepActive) requestWakeLock();
});

function setupTasks() {
    // Handled via socket events
}

async function checkVersion() {
    try {
        const res = await fetch('version.json?t=' + Date.now());
        if (!res.ok) return;
        const data = await res.json();

        // Show "last updated at HH:MM" instead of version number
        const versionEl = document.getElementById('version-display');
        if (versionEl) {
            const now = new Date();
            const timeStr = now.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
            versionEl.textContent = `עודכן לאחרונה: ${timeStr}`;
        }

        // Initialize currentVersion on first fetch
        if (!currentVersion) {
            currentVersion = data.version;
            return;
        }

        if (currentVersion !== data.version) {
            notifyNewVersion();
        }
        currentVersion = data.version;
    } catch (err) {
        console.warn('Version check failed:', err);
    }
}

function notifyNewVersion() {
    // 📳 Strong Morse-code vibration pattern
    if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 500]);

    // 🔔 Distinct alert sound
    const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
    audio.play().catch(() => { });

    const t = $$('toast');
    if (t) {
        t.innerHTML = `✨ <b>גרסה מעודכנת באוויר!</b> <br>
                       מומלץ לרענן לצפייה בשינויים. <br>
                       <button onclick="location.reload(true)" class="btn primary tiny" style="margin-top:10px; padding: 5px 15px; font-size: var(--fs-sm);">רענן עכשיו 🔄</button>`;
        t.classList.remove('hidden');
        t.classList.add('show');
    } else {
        console.warn('Toast element missing for version notification');
    }
}


function onRSVP() {
    const roomId = prompt('הכנס קוד חדר להרשמה (RSVP):');
    if (roomId) {
        pendingRoomId = roomId;
        showScreen('selfie');
        startCamera();
    }
}

function onSignOut() {
    console.log('[Auth] Signing out... clearing state');
    localStorage.clear();
    me = null;
    currentRoomId = null;
    window.location.href = '/'; // Hard redirect to clear everything and room param
}

// --- Camera ---
async function startCamera() {
    const video = $$('selfie-video');
    try {
        // Request a more standard resolution to avoid defaulting to wide-angle lenses
        // A 1:1 aspect ratio constraint helps center the face
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 640 },
                height: { ideal: 640 },
                aspectRatio: { exact: 1 },
                facingMode: 'user'
            },
            audio: false
        });
        video.srcObject = stream;
    } catch (err) {
        console.error('Camera error:', err);
        alert('לא הצלחנו להפעיל את המצלמה. וודא שנתת אישור.');
    }
}

function stopCamera() {
    const video = $$('selfie-video');
    if (video.srcObject) {
        video.srcObject.getTracks().forEach(t => t.stop());
        video.srcObject = null;
    }
}

// --- Selfie ---
function onTakeSelfie() {
    const video = $$('selfie-video');
    const canvas = $$('selfie-canvas');

    const SIZE = 200;
    canvas.width = SIZE;
    canvas.height = SIZE;

    const vw = video.videoWidth || SIZE;
    const vh = video.videoHeight || SIZE;
    const scale = Math.max(SIZE / vw, SIZE / vh);
    const drawW = vw * scale;
    const drawH = vh * scale;
    const ctx = canvas.getContext('2d');

    ctx.translate(SIZE, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, (SIZE - drawW) / 2, (SIZE - drawH) / 2, drawW, drawH);

    selfieDataUrl = canvas.toDataURL('image/jpeg', 0.5);
    localStorage.setItem('haggadah_selfie', selfieDataUrl);

    $$('selfie-preview-img').src = selfieDataUrl;
    $$('selfie-preview-wrap').classList.remove('hidden');
    $$('btn-take-selfie').classList.add('hidden');
    $$('post-selfie-actions').classList.remove('hidden');
}

function onRetake() {
    selfieDataUrl = null;
    localStorage.removeItem('haggadah_selfie');
    $$('selfie-preview-wrap').classList.add('hidden');
    $$('btn-take-selfie').classList.remove('hidden');
    $$('post-selfie-actions').classList.add('hidden');
    $$('selfie-video').style.display = 'block';
}

// --- Flow ---
function onCreateRoom() {
    const nameInput = $$('guest-name');
    const name      = nameInput ? nameInput.value.trim() : '';

    if (!name) {
        showToast('נא להזין שם 😊');
        if (nameInput) nameInput.focus();
        return;
    }

    me = { name, isGuest: false };
    localStorage.setItem('haggadah-user', JSON.stringify(me));

    socket.emit('create-room', { name }, (response) => {
        pendingRoomId = response.roomId;
        rsvpFlow.show();
    });
}

function onCreateRoomReturning() {
    if (!me || !me.name) { showToast('נא להזין שם 😊'); return; }
    socket.emit('create-room', { name: me.name }, (response) => {
        pendingRoomId = response.roomId;
        rsvpFlow.show();
    });
}

function onJoinWithPhoto() {
    if (!pendingRoomId) return;
    stopCamera();
    joinRoom(pendingRoomId);
}

// --- Join room after RSVP, then show finish screen with gallery + countdown ---
function joinRoomAndShowFinish(roomId, rsvpData) {
    const photo = rsvpData.photo;
    const name = rsvpData.name || me?.name;
    const userEmail = me ? me.email : null;

    socket.emit('join-room', { roomId, photo, userEmail, name }, (response) => {
        if (!response.success) { showToast('שגיאה בכניסה לחדר'); return; }

        currentRoomId = response.roomId;
        me = { ...me, ...response.participant };
        leaderId = response.leaderId;
        leaderName = response.leaderName;
        leaderPage = response.currentPage ?? 0;
        currentPage = response.currentPage ?? currentPage ?? 0;
        if (response.images) Object.assign(pageImages, response.images);
        if (response.tasks) roomTasks = response.tasks;
        window._lastRoomData = Object.assign(window._lastRoomData || {}, response);

        updateUrlParam('room', currentRoomId);
        startHeartbeat(currentRoomId);
        updateLeadershipUI();
        renderTasks();

        // Apply seder label received from server
        if (response.sederLabel) {
            sederLabel = response.sederLabel;
            updateSederLabelDisplay(sederLabel);
            const inp = $$('seder-label-input');
            if (inp) inp.value = sederLabel;
        }

        // Go directly to the right screen — no intermediate finish step
        const userName = name || me?.name || '';
        showToast(`ברוכים הבאים${userName ? ', ' + userName : ''}! 🌊`);

        if (response.sederEnded) {
            showGallery();
        } else if (response.sederStarted) {
            showScreen('room');
            renderPage();
        } else if (!window._directHaggadahMode) {
            showScreen('roomLobby');
            renderLobbyParticipants(response.participants || [response.participant]);
            updateLobbyUI(false);
            startLobbyCountdown();
        }
    });
}

// --- Countdown to seder night (April 1, 2026 at 19:00) ---
let _countdownInterval = null;
function startFinishCountdown() {
    const sederDate = new Date(2026, 3, 1, 19, 0, 0); // April 1, 2026 19:00
    const el = $$('finish-countdown');
    if (!el) return;

    function update() {
        const diff = sederDate - new Date();
        if (diff <= 0) {
            el.innerHTML = '<span style="font-size:1.4rem">🍷 הסדר מתחיל עכשיו!</span>';
            clearInterval(_countdownInterval);
            return;
        }
        const days = Math.floor(diff / 86400000);
        const hours = Math.floor((diff % 86400000) / 3600000);
        const mins = Math.floor((diff % 3600000) / 60000);
        el.innerHTML =
            `<span class="cd-num">${days}</span><span class="cd-unit">ימים</span>` +
            `<span class="cd-num">${hours}</span><span class="cd-unit">שעות</span>` +
            `<span class="cd-num">${mins}</span><span class="cd-unit">דקות</span>`;
    }

    clearInterval(_countdownInterval);
    update();
    _countdownInterval = setInterval(update, 60000);
}

// --- Heartbeat: send to server every 5s to show we're actively watching ---
let heartbeatInterval = null;
function startHeartbeat(roomId) {
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    // Send immediately so the dot turns green right away
    if (socket && roomId) socket.emit('heartbeat', { roomId });
    heartbeatInterval = setInterval(() => {
        if (!document.hidden && socket && roomId) {
            socket.emit('heartbeat', { roomId });
        }
    }, 5000);
}

function joinRoom(roomId, rsvpData = null) {
    const photo = rsvpData ? rsvpData.photo : (localStorage.getItem('haggadah_selfie') || selfieDataUrl || generatePlaceholderPhoto());
    const userEmail = me ? me.email : null;
    const name = me ? (me.name || null) : null;

    socket.emit('join-room', { roomId, photo, userEmail, name }, (response) => {
        if (response.success) {
            currentRoomId = response.roomId;
            // MERGE identity — server participant fields update me
            me = { ...me, ...response.participant };
            
            // Sync leader from response
            leaderId = response.leaderId;
            leaderName = response.leaderName;
            
            leaderPage = response.currentPage;
            currentPage = response.currentPage;
            if (response.images) Object.assign(pageImages, response.images);
            if (response.tasks) roomTasks = response.tasks;
            if (response.sederLabel) {
                sederLabel = response.sederLabel;
                updateSederLabelDisplay(sederLabel);
                const inp = $$('seder-label-input');
                if (inp) inp.value = sederLabel;
            }

            $$('total-pages').textContent = HAGGADAH.length;
            
            // Lead toggle visible to everyone — leadership is open
            const leadToggle = document.querySelector('.lead-mode-toggle');
            if (leadToggle) leadToggle.style.display = 'flex';

            updateUrlParam('room', currentRoomId);
            
            if (response.sederEnded) {
                showGallery();
            } else if (response.sederStarted) {
                showScreen('room');
                renderPage();
                // Restore page lock state
                if (response.pageLocked && !amIAllowedLeader() && !window._directHaggadahMode && leaderId) {
                    const prevBtn = $$('btn-prev');
                    const nextBtn = $$('btn-next');
                    if (prevBtn) prevBtn.disabled = true;
                    if (nextBtn) nextBtn.disabled = true;
                }
            } else if (!window._directHaggadahMode) {
                showScreen('roomLobby');
                renderLobbyParticipants(response.participants || [response.participant]);
                updateLobbyUI(false);
                startLobbyCountdown();
            }
            renderTasks();
            updateLeadershipUI();
            startHeartbeat(currentRoomId);

            // Auto-enable lead mode if we are already the room's leader
            if (amIAllowedLeader()) {
                const leadCheckbox = $$('check-lead-mode');
                if (leadCheckbox) leadCheckbox.checked = true;
            }
        } else {
            alert('החדר לא נמצא.');
            window.location.href = '/';
        }
    });
}

// --- Socket events ---
function onRoomUpdated({ participants, currentPage: pg }) {
    console.log('[NAV] onRoomUpdated — pg:', pg, 'currentPage before:', currentPage);
    renderParticipants(participants);
    if (pg != null && pg !== currentPage) {
        currentPage = pg;
        renderPage();
    }
}

function onPageChanged({ currentPage: newPage }) {
    leaderPage = newPage;
    if (isFollowingLeader) {
        currentPage = newPage;
        renderPage();
        showToast(`המנחה עבר לעמוד ${currentPage + 1}`);
    } else {
        renderPage();
    }
}

// --- Render ---
function renderParticipants(participants) {
    const totalSouls = participants.length;
    $$('count-number').textContent = totalSouls;
    if ($$('total-souls')) $$('total-souls').textContent = totalSouls;

    const list = $$('participants-list');
    const gazeboList = $$('gazebo-participants');

    // ── Header strip: smart diff to avoid image flashing ──────────────
    const newIds = new Set(participants.map(p => p.id));
    // Remove avatars no longer in the room
    list.querySelectorAll('[data-pid]').forEach(el => {
        if (!newIds.has(el.dataset.pid)) el.remove();
    });

    if (gazeboList) gazeboList.innerHTML = '';

    participants.forEach(p => {
        const photoUrl = p.photo || generatePlaceholderPhoto(p.name);
        const isOnline = p.online !== false;
        const cls = 'avatar' + (me && p.id === me.id ? ' me' : '') + (!isOnline ? ' offline' : '');

        // Header Strip — reuse existing element if possible
        const existing = list.querySelector(`[data-pid="${CSS.escape(p.id)}"]`);
        if (existing) {
            existing.className = cls; // update online/me status only
        } else {
            const div = document.createElement('div');
            div.className = cls;
            div.dataset.pid = p.id;
            div.appendChild(createAvatarEl(photoUrl));
            list.appendChild(div);
        }

        // Gazebo Grid
        if (gazeboList) {
            const gazWrap = document.createElement('div');
            gazWrap.className = 'gazebo-participant-wrap';

            const gazDiv = document.createElement('div');
            gazDiv.className = 'gazebo-avatar' + (!isOnline ? ' offline' : '') + (p.id === leaderId ? ' is-leader' : '');
            gazDiv.onclick = () => openPhotoZoom(photoUrl);
            gazDiv.appendChild(createAvatarEl(photoUrl));

            // Crown overlay for current leader
            if (p.id === leaderId) {
                const crown = document.createElement('div');
                crown.className = 'gazebo-crown';
                crown.textContent = '👑';
                gazDiv.appendChild(crown);
            }
            gazWrap.appendChild(gazDiv);

            // Name label
            const gName = document.createElement('div');
            gName.className = 'gazebo-participant-name';
            gName.textContent = p.name || '';
            gazWrap.appendChild(gName);

            // Role badge (e.g. "הרשע")
            if (p.role) {
                const roleBadge = document.createElement('div');
                roleBadge.className = 'participant-role-badge';
                roleBadge.textContent = p.role;
                gazWrap.appendChild(roleBadge);
            }

            // Leader-only controls for other participants
            if (amIAllowedLeader() && !(me && p.id === me.id)) {
                const ctrlRow = document.createElement('div');
                ctrlRow.className = 'gazebo-ctrl-row';

                if (p.id !== leaderId) {
                    const promoteBtn = document.createElement('button');
                    promoteBtn.className = 'btn-promote-leader tiny';
                    promoteBtn.textContent = '👑';
                    promoteBtn.title = `הפוך ${p.name || 'אורח'} למנחה`;
                    promoteBtn.onclick = (e) => {
                        e.stopPropagation();
                        if (confirm(`להפוך את ${p.name || 'אורח'} למנחה?`)) {
                            socket.emit('grant-leader', { roomId: currentRoomId, targetSocketId: p.id });
                        }
                    };
                    ctrlRow.appendChild(promoteBtn);
                }

                const kickBtn = document.createElement('button');
                kickBtn.className = 'btn-kick tiny';
                kickBtn.textContent = '🚪';
                kickBtn.title = `הוצא ${p.name || 'אורח'}`;
                kickBtn.onclick = (e) => { e.stopPropagation(); kickParticipant(p.id, p.name); };
                ctrlRow.appendChild(kickBtn);

                gazWrap.appendChild(ctrlRow);
            }

            gazeboList.appendChild(gazWrap);
        }
    });
}

let _lobbyFingerprint = '';
function renderPreregList(participants) {
    const list = $$('prereg-list');
    if (!list) return;
    list.innerHTML = '';
    (participants || []).filter(p => p.preRegistered).forEach(p => {
        const item = document.createElement('div');
        item.className = 'gazebo-participant-card';
        item.style.cssText = 'position:relative; cursor:default;';
        if (p.photo) {
            const img = document.createElement('img');
            img.src = p.photo;
            img.style.cssText = 'width:48px;height:48px;border-radius:50%;object-fit:cover;border:2px solid var(--gold);';
            item.appendChild(img);
        } else {
            const av = document.createElement('div');
            av.style.cssText = 'width:48px;height:48px;border-radius:50%;background:rgba(212,175,55,0.2);display:flex;align-items:center;justify-content:center;font-size:1.2rem;';
            av.textContent = (p.name || '?')[0];
            item.appendChild(av);
        }
        const name = document.createElement('div');
        name.className = 'lobby-participant-name';
        name.textContent = p.name;
        item.appendChild(name);
        const del = document.createElement('button');
        del.style.cssText = 'position:absolute;top:-4px;right:-4px;width:18px;height:18px;border-radius:50%;background:#8b1a1a;border:none;color:white;font-size:0.6rem;cursor:pointer;line-height:1;';
        del.textContent = '✕';
        del.onclick = () => window.removePreregisteredParticipant(p.name);
        item.appendChild(del);
        list.appendChild(item);
    });
}

function renderLobbyParticipants(participants) {
    const grid = $$('room-lobby-participants');
    if (!grid) return;

    // Skip full re-render if nothing changed
    const fp = participants.map(p => `${p.id}:${p.name}:${p.photo}:${p.active}:${p.id === leaderId}`).join('|');
    if (fp === _lobbyFingerprint) return;
    _lobbyFingerprint = fp;

    grid.innerHTML = '';

    // Update participant counter
    const counter = $$('lobby-participant-count');
    if (counter) counter.textContent = `👥 ${participants.length} נרשמו`;

    participants.forEach(p => {
        const photoUrl = p.photo || generatePlaceholderPhoto(p.name);

        // Wrapper holds avatar circle + name label
        const wrapper = document.createElement('div');
        wrapper.className = 'lobby-participant-wrap';

        const card = document.createElement('div');
        card.className = 'gazebo-avatar lobby-avatar-card';

        card.appendChild(createAvatarEl(photoUrl));

        // 🟢 Online indicator dot
        const dot = document.createElement('div');
        dot.className = 'online-dot' + (p.active ? ' active' : ' offline');
        card.appendChild(dot);

        // 📸 Is it ME? Add badge & retake ability
        const isMe = (p.id === socket.id);
        if (isMe) {
            const meBadge = document.createElement('div');
            meBadge.className = 'me-badge';
            meBadge.textContent = 'אני';
            card.appendChild(meBadge);

            const retake = document.createElement('div');
            retake.className = 'retake-badge';
            retake.innerHTML = '🔄';
            card.appendChild(retake);

            card.title = 'לחץ לעדכון תמונה';
            card.onclick = () => {
                if (rsvpFlow) rsvpFlow.show();
            };
        }

        wrapper.appendChild(card);

        // Name label under avatar
        const nameLabel = document.createElement('div');
        nameLabel.className = 'lobby-participant-name';
        nameLabel.textContent = p.name || 'אורח';
        // Crown badge for current leader
        if (p.id === leaderId) {
            nameLabel.textContent = '👑 ' + (p.name || 'אורח');
        }
        wrapper.appendChild(nameLabel);

        // Role badge (e.g. "הרשע")
        if (p.role) {
            const roleBadge = document.createElement('div');
            roleBadge.className = 'participant-role-badge';
            roleBadge.textContent = p.role;
            wrapper.appendChild(roleBadge);
        }

        // ✕ Remove participant button — host only, not self
        if (amIAllowedLeader() && !isMe) {
            const removeBtn = document.createElement('button');
            removeBtn.style.cssText = 'position:absolute;top:-4px;right:-4px;width:20px;height:20px;border-radius:50%;background:#8b1a1a;border:none;color:white;font-size:0.65rem;cursor:pointer;z-index:5;line-height:1;';
            removeBtn.textContent = '✕';
            removeBtn.title = `הסר ${p.name || 'אורח'}`;
            removeBtn.onclick = async (e) => {
                e.stopPropagation();
                await fetch('/api/room-participant', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ roomId: currentRoomId, participantId: p.id })
                });
            };
            wrapper.style.position = 'relative';
            wrapper.appendChild(removeBtn);
        }

        // "Promote to Leader" button — only visible to co-leaders, not for self
        if (amIAllowedLeader() && !isMe && p.id !== leaderId) {
            const promoteBtn = document.createElement('button');
            promoteBtn.className = 'btn-promote-leader';
            promoteBtn.textContent = '👑 מנחה';
            promoteBtn.title = `הפוך ${p.name || 'אורח'} למנחה`;
            promoteBtn.onclick = () => {
                if (confirm(`להפוך את ${p.name || 'אורח'} למנחה?`)) {
                    socket.emit('grant-leader', { roomId: currentRoomId, targetSocketId: p.id });
                }
            };
            wrapper.appendChild(promoteBtn);
        }

        grid.appendChild(wrapper);
    });

    // Remove fade mask if grid fits within max-height (no scroll needed)
    const container = grid.closest('.gazebo-grid-container');
    if (container) {
        requestAnimationFrame(() => {
            container.classList.toggle('no-scroll', grid.scrollHeight <= 265);
        });
    }
}

function updateLobbyUI(sederStarted) {
    if (sederStarted) return;
    
    // Open leadership — whoever took the lead is the leader
    const isLeader = amIAllowedLeader();

    const leaderActions = $$('lobby-leader-actions');
    const guestNote = $$('lobby-guest-note');

    console.log(`[Lobby] Updating UI. isLeader: ${isLeader}, email: ${me?.email}, leaderId: ${leaderId}`);

    if (leaderActions) {
        if (isLeader) {
            leaderActions.classList.remove('hidden');
            if (guestNote) guestNote.classList.add('hidden');
        } else {
            leaderActions.classList.add('hidden');
            if (guestNote) guestNote.classList.remove('hidden');
            
            // Show simple waiting message — PIN box in HTML handles leader login
            guestNote.innerHTML = '✨ ממתינים שהמנחה יתחיל את הסדר...';
        }
    }

    // Hide PIN login box if already the leader
    const hostLoginBox = $$('lobby-host-login');
    if (hostLoginBox) {
        hostLoginBox.style.display = isLeader ? 'none' : '';
    }
}

function onStartSeder() {
    if (!currentRoomId) return;
    socket.emit('start-seder', { roomId: currentRoomId });
}


// Build the AI image zone element (placed at middle or end of page text)
function buildImageZone(imageData, index) {
    const imgZone = document.createElement('div');
    imgZone.className = 'page-image-zone';
    imgZone.id = `img-wrap-${index}`;

    const overlay = document.createElement('div');
    overlay.className = 'status-overlay hidden';
    overlay.id = `status-overlay-${index}`;
    overlay.innerHTML = `
        <div class="status-text">אין תמונה עדיין</div>
        <div class="status-log">לחץ להפקת תמונה AI 🎨</div>
    `;
    imgZone.appendChild(overlay);

    if (imageData) {
        const currentImgUrl = typeof imageData === 'string' ? imageData : imageData.url;
        const img = document.createElement('img');
        img.src = currentImgUrl;
        img.className = 'page-image has-image';
        img.alt = 'איור AI';
        imgZone.onclick = (e) => {
            e.stopPropagation();
            openPhotoZoom(currentImgUrl);
        };
        const hint = document.createElement('div');
        hint.className = 'download-hint';
        hint.innerHTML = '🔍 לחץ להגדלה';
        imgZone.appendChild(hint);
        imgZone.appendChild(img);
        // Host-only regenerate button
        if (amIAllowedLeader()) {
            const regenBtn = document.createElement('button');
            regenBtn.className = 'btn-regen-image';
            regenBtn.title = 'צור תמונה חדשה';
            regenBtn.innerHTML = '🔄';
            regenBtn.onclick = (e) => {
                e.stopPropagation();
                triggerPageGeneration(index);
            };
            imgZone.appendChild(regenBtn);
        }
        if (imageData.featuredPhotos && imageData.featuredPhotos.length > 0) {
            const bubblesContainer = document.createElement('div');
            bubblesContainer.className = 'featured-bubbles';
            imageData.featuredPhotos.forEach(photo => {
                const bubble = document.createElement('div');
                bubble.className = 'featured-participant';
                const bImg = document.createElement('img');
                bImg.src = photo;
                bubble.appendChild(bImg);
                bubblesContainer.appendChild(bubble);
            });
            imgZone.appendChild(bubblesContainer);
        }
    } else {
        const shimmer = document.createElement('div');
        shimmer.className = 'image-shimmer';
        imgZone.appendChild(shimmer);
        overlay.classList.remove('hidden');
        imgZone.onclick = () => triggerPageGeneration(index);
    }
    return imgZone;
}

// ── Character role cards ─────────────────────────────────────────────────────
// Each entry: match (substring of participant name), role label, pages[] (0-based)
const CHARACTER_ROLES = [
    { match: 'יעלי',  role: 'המספרת ✨',              pages: [0, 9, 14, 16, 20, 21, 26, 31] },
    { match: 'מורן',  role: 'פרעה 👑',                pages: [4, 10, 15, 20, 26]            },
    { match: 'אוהד',  role: 'עבד שנגאל ⛓️',           pages: [4, 3, 10, 19, 25, 30]         },
    { match: 'דני',   role: 'הרשע 😈',                pages: [5, 0, 15, 22, 27, 32]         },
    { match: 'איתי',  role: 'הבן החכם 🤓',            pages: [5, 3, 12, 19, 28]             },
    { match: 'אלעד',  role: 'הבן התם 🙂',             pages: [5, 2, 13, 17, 24, 28]         },
    { match: 'ערן',   role: 'שאינו יודע לשאול 🤷',    pages: [5, 3, 8, 13, 19, 25, 28]      },
    { match: 'יעל-ק', role: 'בת פרעה 👸',             pages: [6, 4, 14, 22, 29]             },
    { match: 'אורן',  role: 'משה רבנו 🧙',             pages: [7, 9, 15, 16, 21, 29, 32]    },
    { match: 'Ailey', role: 'גרת צדק 🌍',             pages: [8, 2, 6, 11, 17, 23]          },
    { match: 'מאיה',  role: 'קריעת ים סוף 🌊',        pages: [11, 6, 20, 23, 29]            },
    { match: 'דרור',  role: 'אהרון הכהן ✡️',           pages: [13, 7, 18, 25, 30]            },
    { match: 'מיכל',  role: 'אליהו הנביא 🍷',          pages: [21, 1, 9, 14, 18, 24, 31]    },
    { match: 'אפרת',  role: 'מרים הנביאה 🪘',          pages: [26, 1, 7, 12, 16, 22, 32]    },
    { match: 'יעל-ד', role: 'בת חורין 🌸',             pages: [24, 2, 11, 18, 25, 30]       },
    { match: 'נטע',   role: 'בשדה הגאולה 🌿',          pages: [27, 1, 8, 12, 17, 23, 31]    },
];

function buildCharacterCards(pageIndex) {
    // Find roles relevant to this page
    const relevant = CHARACTER_ROLES.filter(r => r.pages.includes(pageIndex));
    if (relevant.length === 0) return null;

    // Match each role to a participant by name substring (case-insensitive)
    const participantsList = (window._lastRoomData && window._lastRoomData.participants) || [];
    const cards = relevant.map(r => {
        const p = participantsList.find(p =>
            p.name && p.name.toLowerCase().includes(r.match.toLowerCase())
        );
        return { role: r.role, match: r.match, photo: p?.photo || null, name: p?.name || r.match };
    });

    const strip = document.createElement('div');
    strip.className = 'char-card-strip';

    cards.forEach(c => {
        const card = document.createElement('div');
        card.className = 'char-card';
        card.title = c.name;

        const photoEl = document.createElement('div');
        photoEl.className = 'char-card-photo';
        if (c.photo) {
            const img = document.createElement('img');
            img.src = c.photo;
            img.alt = c.name;
            img.onclick = () => openPhotoZoom(c.photo);
            photoEl.appendChild(img);
        } else {
            photoEl.textContent = c.role.split(' ').pop(); // emoji fallback
            photoEl.classList.add('char-card-emoji');
        }
        card.appendChild(photoEl);

        const roleEl = document.createElement('div');
        roleEl.className = 'char-card-role';
        roleEl.textContent = c.role;
        card.appendChild(roleEl);

        strip.appendChild(card);
    });

    return strip;
}

function renderPage() {
    const page = HAGGADAH[currentPage];
    if (!page) return;

    updateMealProgress();
    if (exodusMap) exodusMap.updateProgress(currentPage, HAGGADAH.length);

    const el = $$('haggadah-pages');
    if (!el) return;

    const imageData = pageImages[currentPage];
    const index = currentPage;
    const segments = page.segments || [];
    // For long pages (>4 segments): place image after the 3rd segment (middle)
    // For short pages: place image at the end
    const splitIdx = segments.length > 4 ? 3 : segments.length;

    el.style.opacity = '0';
    setTimeout(() => {
        el.innerHTML = '';

        const isTranslit = currentLanguage === 'translit';
        const isEnglish = currentLanguage === 'en';
        const isLtr = isTranslit || isEnglish;
        const enPage = (typeof HAGGADAH_EN !== 'undefined') ? HAGGADAH_EN[currentPage] : null;

        // --- Title ---
        const titleDiv = document.createElement('div');
        titleDiv.className = 'page-title';
        titleDiv.textContent = isTranslit ? transliterate(page.title) : page.title;
        if (isLtr) titleDiv.classList.add('translit-text');
        el.appendChild(titleDiv);

        // --- Character cards (Haggadah roles) ---
        const charCards = buildCharacterCards(currentPage);
        if (charCards) el.appendChild(charCards);

        // --- Readers strip (who is reading along) ---
        if (activeReaders.length > 0) {
            const readersDiv = document.createElement('div');
            readersDiv.className = 'readers-strip';
            readersDiv.id = 'readers-strip';
            const label = document.createElement('span');
            label.className = 'readers-label';
            label.textContent = `📖 ${activeReaders.length} קוראים יחד`;
            readersDiv.appendChild(label);
            activeReaders.forEach(r => {
                if (r.photo) {
                    const av = createAvatarEl(r.photo);
                    av.className = (isEmojiPhoto(r.photo) ? 'emoji-avatar' : '') + ' reader-avatar';
                    readersDiv.appendChild(av);
                }
            });
            el.appendChild(readersDiv);
        }

        // --- Text (before image) ---
        const textBefore = document.createElement('div');
        textBefore.className = 'page-text' + (isLtr ? ' ltr-mode' : '');

        // --- Text (after image, only for long pages) ---
        const textAfter = document.createElement('div');
        textAfter.className = 'page-text page-text-after' + (isLtr ? ' ltr-mode' : '');
        let hasAfterText = false;

        if (segments.length > 0) {
            segments.forEach((seg, sIdx) => {
                // ── Video Break card ──────────────────────────────────
                if (seg.type === 'video') {
                    const card = document.createElement('div');
                    card.className = 'video-break-card';
                    card.id = `seg-${index}-${sIdx}`;
                    card.innerHTML = `
                        <div class="video-break-icon">📺</div>
                        <div class="video-break-title">${seg.videoTitle || seg.he}</div>
                        <div class="video-break-sub">עוצרים לרגע — מפעילים סרטון קצר על המקרן</div>
                        <a class="video-break-btn" href="${seg.videoUrl}" target="_blank" rel="noopener">
                            פתח סרטון ▶
                        </a>`;
                    if (highlightedSegmentIndex === sIdx) card.classList.add('highlighted');
                    if (sIdx < splitIdx) {
                        textBefore.appendChild(card);
                    } else {
                        textAfter.appendChild(card);
                        hasAfterText = true;
                    }
                    return;
                }

                const p = document.createElement('p');
                p.className = 'text-segment';
                p.id = `seg-${index}-${sIdx}`;
                if (isEnglish && enPage && enPage[sIdx]) {
                    p.textContent = enPage[sIdx];
                    p.classList.add('ltr', 'translit-text');
                } else if (isTranslit) {
                    const transText = transliterate(seg.he);
                    p.innerHTML = transText.replace(/shadayim/gi,
                        '<span class="giggle-word" onclick="playGiggle(event)">$&</span>');
                    p.classList.add('ltr', 'translit-text');
                } else {
                    p.innerHTML = wrapGiggleWords(seg.he);
                }
                p.onclick = () => onSegmentClick(sIdx);
                if (highlightedSegmentIndex === sIdx) p.classList.add('highlighted');
                if (sIdx < splitIdx) {
                    textBefore.appendChild(p);
                } else {
                    textAfter.appendChild(p);
                    hasAfterText = true;
                }
            });
        } else if (page.text) {
            const p = document.createElement('p');
            p.className = 'text-segment';
            if (isEnglish && enPage && enPage[0]) {
                p.textContent = enPage[0];
                p.classList.add('ltr', 'translit-text');
            } else if (isTranslit) {
                const transText = transliterate(page.text);
                p.innerHTML = transText.replace(/shadayim/gi,
                    '<span class="giggle-word" onclick="playGiggle(event)">$&</span>');
                p.classList.add('ltr', 'translit-text');
            } else {
                p.innerHTML = wrapGiggleWords(page.text);
            }
            textBefore.appendChild(p);
        }

        el.appendChild(textBefore);

        // --- Image Zone (placed at natural reading break) ---
        el.appendChild(buildImageZone(imageData, index));

        // --- Remaining text after image (long pages only) ---
        if (hasAfterText) el.appendChild(textAfter);

        // --- מי יודע button (shown on Nirtzah pages, index 26-31) ---
        if (index >= 26) {
            const myBtn = document.createElement('button');
            myBtn.className = 'btn outline small';
            myBtn.style.cssText = 'width:100%;margin-top:1.5rem;font-size:var(--fs-sm);';
            myBtn.textContent = '🎵 מִי יוֹדֵעַ? — צרו תמונות עם כולם';
            myBtn.onclick = openMiYodea;
            el.appendChild(myBtn);
        }

        // Reactions rendered in global fixed bar (see renderReactionsBar)
        renderReactionsBar(index);

        $$('current-page-num').textContent = currentPage + 1;
        $$('total-pages').textContent = HAGGADAH.length;
        $$('btn-prev').disabled = currentPage === 0;
        $$('btn-next').disabled = currentPage === HAGGADAH.length - 1;

        updateMealProgress();

        // Sync button visibility
        const syncBtn = $$('btn-sync');
        const isLeading = amIAllowedLeader();
        if (isLeading || (isFollowingLeader && currentPage === leaderPage)) {
            syncBtn.classList.add('hidden');
        } else {
            syncBtn.classList.remove('hidden');
        }

        el.style.opacity = '1';
        applyFontSize();

        // Scroll page content to top on page change
        const container = document.querySelector('.haggadah-container');
        if (container) container.scrollTop = 0;
    }, 180);
}

function changePage(delta) {
    const next = currentPage + delta;
    if (next >= 0 && next < HAGGADAH.length) {
        const amILeader = amIAllowedLeader();

        if (amILeader) {
            // Global move — all followers update too
            currentPage = next;
            socket.emit('change-page', { roomId: currentRoomId, pageIndex: next });
        } else {
            // Local move (Free Browsing)
            isFollowingLeader = false;
            currentPage = next;
            updateLeadershipUI();
        }

        renderPage();
        handlePageEffects(next);
    }
}

function onSyncWithLeader() {
    isFollowingLeader = true;
    if ($$('check-lead-mode')) $$('check-lead-mode').checked = false; // Stop leading if following
    currentPage = leaderPage;
    renderPage();
    updateLeadershipUI();
    showToast('חזרת לסנכרון עם עורך הסדר');
}

function updateLeadershipUI() {
    const syncBtn = $$('btn-sync');
    const statusText = $$('leadership-status');

    if (!syncBtn || !statusText) return;

    const amILeader = amIAllowedLeader();

    if (isFollowingLeader || amILeader) {
        syncBtn.classList.add('hidden');
    } else {
        syncBtn.classList.remove('hidden');
    }

    if (amILeader) {
        const myName = me?.name ? `👑 שלום ${me.name.split(' ')[0]}! (מנחה)` : '👑 אתה עורך הסדר';
        statusText.innerHTML = myName;
        statusText.classList.add('is-leading');
    } else if (leaderId) {
        statusText.innerHTML = `👤 מנחה: ${leaderName}`;
        statusText.classList.remove('is-leading');
    } else {
        statusText.innerHTML = '🛡️ מחפש מנהל...';
        statusText.classList.remove('is-leading');
    }

    // Show/hide host controls panel
    const hostControls = $$('menu-host-controls');
    if (hostControls) hostControls.classList.toggle('hidden', !amILeader);

    // Hide "Be the Host" button when already leader
    const claimHostDiv = $$('menu-claim-host');
    if (claimHostDiv) claimHostDiv.style.display = amILeader ? 'none' : '';

    // Crucial: Also update Lobby if we are in it
    updateLobbyUI(false);
}

function toggleMenuPinInput() {
    const wrap = $$('menu-pin-input-wrap');
    if (!wrap) return;
    const visible = wrap.style.display !== 'none';
    wrap.style.display = visible ? 'none' : 'block';
    if (!visible) { const inp = $$('menu-pin-input'); if (inp) inp.focus(); }
}
window.toggleMenuPinInput = toggleMenuPinInput;

function claimLeadFromMenu() {
    const pin = $$('menu-pin-input')?.value?.trim();
    if (!pin) { showToast('Enter the host code 🔑'); return; }
    socket.emit('claim-lead-with-pin', { roomId: currentRoomId, pin }, (res) => {
        if (res?.success) {
            showToast('Welcome, Host! 👑');
            const wrap = $$('menu-pin-input-wrap');
            if (wrap) wrap.style.display = 'none';
            toggleMenu();
        } else {
            showToast('Wrong code ❌');
        }
    });
}
window.claimLeadFromMenu = claimLeadFromMenu;

function handlePageEffects(pageIndex) {
    const pageText = HAGGADAH[pageIndex]?.he || "";

    if (pageText.includes("דָּם")) {
        triggerEffect('blood');
    } else if (pageText.includes("צְפַרְדֵּעַ")) {
        triggerEffect('frogs');
    } else if (pageText.includes("קריעת ים סוף") || pageText.includes("הַיָּם")) {
        triggerEffect('sea');
    }
}

function triggerEffect(effectType) {
    if (socket && amIAllowedLeader()) {
        socket.emit('trigger-effect', { roomId: currentRoomId, effectType });
    } else {
        triggerLocalEffect(effectType);
    }
}

function triggerLocalEffect(type) {
    const container = $$('effects-container');
    if (!container) return;

    console.log(`[Effect] Triggering local effect: ${type}`);
    showPlagueContext(type);
    container.innerHTML = '';
    container.classList.remove('hidden');
    container.className = 'effects-container ' + type;

    if (type === 'blood') {
        for (let i = 0; i < 20; i++) {
            const drop = document.createElement('div');
            drop.className = 'blood-drop';
            drop.style.left = Math.random() * 100 + 'vw';
            drop.style.animationDelay = Math.random() * 3 + 's';
            container.appendChild(drop);
        }
    } else if (type === 'frogs') {
        for (let i = 0; i < 25; i++) {
            const frog = document.createElement('div');
            frog.className = 'frog-anim';
            frog.innerText = '🐸';
            frog.style.left = Math.random() * 100 + 'vw';
            frog.style.bottom = '-50px';
            frog.style.animationDelay = Math.random() * 2 + 's';
            container.appendChild(frog);
        }
    } else if (type === 'lice') {
        for (let i = 0; i < 40; i++) {
            const bug = document.createElement('div');
            bug.className = 'lice-anim';
            bug.textContent = '🦟';
            bug.style.left = Math.random() * 100 + 'vw';
            bug.style.top = Math.random() * 100 + 'vh';
            bug.style.animationDelay = Math.random() * 2 + 's';
            bug.style.fontSize = (0.6 + Math.random() * 0.8) + 'rem';
            container.appendChild(bug);
        }
    } else if (type === 'darkness') {
        const dark = document.createElement('div');
        dark.className = 'darkness-overlay';
        container.appendChild(dark);
        setTimeout(() => { container.classList.add('hidden'); container.innerHTML = ''; }, 5000);
        return;
    } else if (type === 'dayenu') {
        confetti({ particleCount: 250, spread: 130, origin: { y: 0.4 }, colors: ['#d4af37', '#8b0000', '#1a6b3a', '#fff'] });
        setTimeout(() => confetti({ particleCount: 120, spread: 80, origin: { x: 0.1, y: 0.6 } }), 600);
        setTimeout(() => confetti({ particleCount: 120, spread: 80, origin: { x: 0.9, y: 0.6 } }), 900);
        container.classList.add('hidden');
        return;
    } else if (type === 'sea') {
        const leftWave = document.createElement('div');
        leftWave.className = 'sea-wave-left';
        const rightWave = document.createElement('div');
        rightWave.className = 'sea-wave-right';
        container.appendChild(leftWave);
        container.appendChild(rightWave);
        setTimeout(() => { container.classList.add('hidden'); }, 5000);
        return;
    }

    setTimeout(() => {
        container.classList.add('hidden');
        container.innerHTML = '';
    }, 6000);
}

// --- Task Board ---
function toggleTasks() {
    $$('task-sidebar').classList.toggle('hidden');
}

function addTask() {
    const input = $$('input-new-task');
    const text = input.value.trim();
    if (!text) return;

    // Oren's name as author
    const author = "אורן";
    socket.emit('add-task', { roomId: currentRoomId, text, author });
    input.value = '';
}

function toggleTask(taskId) {
    socket.emit('toggle-task', { roomId: currentRoomId, taskId });
}

function deleteTask(taskId) {
    socket.emit('delete-task', { roomId: currentRoomId, taskId });
}

function renderTasks() {
    const list = $$('task-list');
    if (!list) return;
    list.innerHTML = '';

    // Sort: Uncompleted first
    const sortedTasks = [...roomTasks].sort((a, b) => {
        if (a.completed === b.completed) return 0;
        return a.completed ? 1 : -1;
    });

    sortedTasks.forEach(task => {
        // Handle legacy string format or missing properties
        const taskText = typeof task === 'string' ? task : (task.text || 'משימה');
        const taskAuthor = task.author || 'סדר';
        const taskId = task.id || `task-${Math.random()}`;
        const isCompleted = !!task.completed;

        const item = document.createElement('div');
        item.className = 'task-item' + (isCompleted ? ' completed' : '');

        item.innerHTML = `
            <div class="task-checkbox" onclick="toggleTask('${taskId}')">
                ${isCompleted ? '✓' : ''}
            </div>
            <div class="task-text">
                <span class="task-author">${taskAuthor}:</span>
                ${taskText}
            </div>
            <button class="btn-delete-task" onclick="deleteTask('${task.id}')">&times;</button>
        `;
        list.appendChild(item);
    });
}

// --- Host Controls ---
function kickParticipant(targetSocketId, name) {
    if (!confirm(`להוציא את ${name || 'האורח'} מהחדר?`)) return;
    socket.emit('kick-participant', { roomId: currentRoomId, targetSocketId });
    showToast(`${name || 'האורח'} הוצא מהחדר`);
}

function showDNDPrompt() {
    const existing = document.getElementById('dnd-prompt');
    if (existing) return;
    const el = document.createElement('div');
    el.id = 'dnd-prompt';
    el.className = 'dnd-prompt';
    el.innerHTML = `
        <div class="dnd-prompt-inner">
            <span class="dnd-icon">🔕</span>
            <span class="dnd-text">הפעל <strong>מצב שקט</strong> כדי להתרכז בסדר</span>
            <button class="dnd-close" onclick="this.closest('#dnd-prompt').remove()">✕</button>
        </div>
    `;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 8000);
}
window.showDNDPrompt = showDNDPrompt;

function onEndSeder() {
    if (!confirm('לסיים את הסדר ולעבור לגלריה?')) return;
    socket.emit('end-seder', { roomId: currentRoomId });
}

function showGallery() {
    showScreen('gallery');

    // ── Participants portrait wall ──────────────────────────────────
    const participantsEl = $$('gallery-participants');
    if (participantsEl) {
        participantsEl.innerHTML = '';
        const room = window._lastRoomData;
        const parts = room?.participants || [];
        if (parts.length === 0) {
            participantsEl.innerHTML = '<p class="gallery-empty">אין משתתפים</p>';
        } else {
            const SHOW_INITIAL = 8;
            const renderTiles = (list) => list.map((p, i) => {
                const tile = document.createElement('div');
                tile.className = 'gallery-person-tile';
                tile.style.setProperty('--delay', `${i * 50}ms`);
                const photo = p.photo || '';
                tile.innerHTML = `
                    <div class="gallery-person-frame">
                        ${photo
                            ? `<img src="${photo}" alt="${p.name}" class="gallery-person-img">`
                            : `<div class="gallery-person-placeholder">${(p.name || '?')[0]}</div>`
                        }
                        ${p.id === (room?.leaderId) ? '<div class="gallery-person-crown">👑</div>' : ''}
                    </div>
                    <div class="gallery-person-name">${p.name || '?'}</div>
                `;
                return tile;
            });

            renderTiles(parts.slice(0, SHOW_INITIAL)).forEach(t => participantsEl.appendChild(t));

            if (parts.length > SHOW_INITIAL) {
                const remaining = parts.length - SHOW_INITIAL;
                const showBtn = document.createElement('button');
                showBtn.className = 'gallery-show-all-btn';
                showBtn.textContent = `+ עוד ${remaining} אורחים`;
                showBtn.onclick = () => {
                    showBtn.remove();
                    renderTiles(parts.slice(SHOW_INITIAL)).forEach(t => participantsEl.appendChild(t));
                };
                participantsEl.appendChild(showBtn);
            }
        }
    }

    // ── AI story images ─────────────────────────────────────────────
    const grid = $$('gallery-grid');
    const noImages = $$('gallery-no-images');
    if (!grid) return;
    grid.innerHTML = '';

    const entries = Object.entries(pageImages);
    if (entries.length === 0) {
        noImages?.classList.remove('hidden');
    } else {
        noImages?.classList.add('hidden');
        entries.sort((a, b) => Number(a[0]) - Number(b[0])).forEach(([idx, imageData], cardIdx) => {
            const url = typeof imageData === 'string' ? imageData : imageData?.url;
            if (!url) return;
            const page = HAGGADAH[Number(idx)];
            const card = document.createElement('div');
            card.className = 'gallery-card';
            card.style.setProperty('--delay', `${cardIdx * 80}ms`);
            card.innerHTML = `
                <img src="${url}" alt="עמוד ${Number(idx)+1}" loading="lazy" onclick="openPhotoZoom('${url}')">
                <div class="gallery-card-title">${page?.title || 'עמוד ' + (Number(idx)+1)}</div>
            `;
            grid.appendChild(card);
        });
    }

    // Fireworks confetti
    confetti({ particleCount: 200, spread: 120, origin: { y: 0.3 }, colors: ['#d4af37', '#8b0000', '#1a6b3a'] });
    setTimeout(() => confetti({ particleCount: 100, spread: 80, origin: { x: 0.1, y: 0.5 } }), 800);
    setTimeout(() => confetti({ particleCount: 100, spread: 80, origin: { x: 0.9, y: 0.5 } }), 1200);
}

function shareOnWhatsApp() {
    const text = `סיימנו את הסדר! חג פסח שמח 🍷🎉\nהסדר האינטראקטיבי שלנו: ${window.location.origin}`;
    window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
}

window.shareOnWhatsApp = shareOnWhatsApp;

// --- Feedback Modal ---
function showFeedback() {
    let modal = $$('feedback-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
}

function closeFeedback() {
    const modal = $$('feedback-modal');
    if (modal) modal.classList.add('hidden');
}

function submitFeedback() {
    const rating = document.querySelector('.star-btn.selected')?.dataset.val || '';
    const text = $$('feedback-text')?.value.trim() || '';
    if (!rating) { showToast('בחרו כוכבים 🌟'); return; }

    // Broadcast feedback to all room participants as a toast
    const name = me?.name ? me.name.split(' ')[0] : 'אורח';
    const stars = '⭐'.repeat(Number(rating));
    const msg = `${stars} פידבק מ${name}${text ? ': ' + text : ''}`;
    if (socket && currentRoomId) {
        socket.emit('broadcast-feedback', { roomId: currentRoomId, message: msg });
    }
    showToast('תודה! הפידבק נשלח 💌');
    closeFeedback();
    if ($$('feedback-text')) $$('feedback-text').value = '';
    document.querySelectorAll('.star-btn').forEach(b => b.classList.remove('selected'));
}

function selectStar(val) {
    document.querySelectorAll('.star-btn').forEach((b, i) => {
        b.classList.toggle('selected', i < val);
    });
}
window.selectStar = selectStar;
window.closeFeedback = closeFeedback;
window.submitFeedback = submitFeedback;

function triggerNanoTest() {
    if (!currentRoomId) {
        showToast('יש להצטרף לחדר קודם.');
        return;
    }
    showToast('יוצר תמונה קבוצתית (NB PRO)...');
    socket.emit('test-nano-banana', { roomId: currentRoomId });
}

// --- Gazebo Extras ---
function updateMealProgress() {
    const total = HAGGADAH.length;
    const current = currentPage + 1;
    const percent = Math.round((current / total) * 100);

    const bar = $$('meal-progress-bar');
    const text = $$('meal-eta-text');

    if (bar) bar.style.width = percent + '%';
    
    let footerText = '';
    
    if (text) {
        // Find index of "Shulchan Orech" — strip nikkud (vowel marks) before comparing
        const stripNikkud = s => s.replace(/[\u0591-\u05C7]/g, '');
        const dinnerIndex = HAGGADAH.findIndex(p => stripNikkud(p.title).includes('שלחן'));
        if (dinnerIndex !== -1) {
            const remaining = dinnerIndex - currentPage;
            if (remaining > 0) {
                text.textContent = `נשארו עוד ${remaining} דפים עד לאוכל 🍗`;
                footerText = `עברת: ${currentPage + 1} | עד 🍽️: ${remaining}`;
            } else if (remaining === 0) {
                text.textContent = `בתיאבון! שולחן עורך כאן 🍷🍗`;
                footerText = `בתיאבון! 🍽️`;
            } else {
                text.textContent = `אנחנו אחרי האוכל, ממשיכים בהלל! 🍷`;
                footerText = '';
            }
        } else {
            text.textContent = `${percent}% מההגדה מאחורינו`;
        }
    }

    const footerIndicator = $$('meal-footer-indicator');
    if (footerIndicator) {
        if (footerText) {
            footerIndicator.textContent = footerText;
            footerIndicator.classList.remove('hidden');
        } else {
            footerIndicator.classList.add('hidden');
        }
    }
}

function openPhotoZoom(url) {
    const viewer = $$('photo-viewer');
    const img = $$('zoomed-photo');
    img.src = url;
    viewer.classList.remove('hidden');
}

function closePhotoZoom() {
    $$('photo-viewer').classList.add('hidden');
}

function downloadZoomedImage() {
    const img = $$('zoomed-photo');
    if (!img?.src) return;
    const a = document.createElement('a');
    a.href = img.src;
    a.download = 'haggadah-image.png';
    a.click();
}

function shareZoomedImage() {
    const img = $$('zoomed-photo');
    if (!img?.src) return;
    if (navigator.share) {
        navigator.share({ title: 'תמונת הגדה', url: img.src }).catch(() => {});
    } else {
        window.open('https://wa.me/?text=' + encodeURIComponent('תמונה מהסדר שלנו 🌊\n' + img.src), '_blank');
    }
}

// --- Font Size Controls ---
const FONT_SIZES = [0.85, 0.95, 1.05, 1.15, 1.3, 1.5];
let fontSizeIdx = parseInt(localStorage.getItem('haggadah_font_idx') || '2'); // default 1.05rem

function changeFontSize(delta) {
    fontSizeIdx = Math.max(0, Math.min(FONT_SIZES.length - 1, fontSizeIdx + delta));
    localStorage.setItem('haggadah_font_idx', fontSizeIdx);
    applyFontSize();
}

function applyFontSize() {
    const size = FONT_SIZES[fontSizeIdx];
    document.querySelectorAll('.page-text').forEach(el => {
        el.style.fontSize = size + 'rem';
    });
    const label = $$('font-size-label');
    if (label) label.textContent = Math.round(size * 100) + '%';
}

// Global exposure for onclick
window.closePhotoZoom = closePhotoZoom;
window.downloadZoomedImage = downloadZoomedImage;
window.shareZoomedImage = shareZoomedImage;
window.changeFontSize = changeFontSize;
window.toggleLanguage = toggleLanguage;
window.onSegmentClick = onSegmentClick;

// --- Utils ---
function showScreen(name) {
    // Reset html/body scroll — mobile browsers auto-scroll on input focus
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;

    Object.entries(screens).forEach(([k, el]) => {
        if (!el) return;
        if (k === name) {
            el.classList.remove('hidden');
            el.classList.add('active');
        } else {
            el.classList.remove('active');
            el.classList.add('hidden');
        }
    });
}

function updateUrlParam(key, value) {
    const url = new URL(window.location);
    url.searchParams.set(key, value);
    window.history.pushState({}, '', url);
}

function onCopyLink() {
    const url = window.location.origin + '?room=' + currentRoomId;
    navigator.clipboard.writeText(url).then(() => {
        showToast('הקישור הועתק! שלח אותו בווטסאפ ✉️');
        if (!$$('room-menu').classList.contains('hidden')) toggleMenu();
    });
}

function toggleMenu() {
    const menu = $$('room-menu');
    const btn = $$('btn-menu');
    if (!menu || !btn) return;
    menu.classList.toggle('hidden');
    btn.classList.toggle('active');
}

function showToast(msg) {
    const t = $$('toast');
    if (!t) {
        console.error('Toast element not found! Using alert instead:', msg);
        // alert(msg); // Optional: fallback to alert
        return;
    }
    t.textContent = msg;
    t.classList.remove('hidden');
    t.classList.add('show');
    setTimeout(() => {
        t.classList.remove('show');
        setTimeout(() => t.classList.add('hidden'), 300);
    }, 3000);
}

function downloadImage(url, filename) {
    showToast('מוריד תמונה... 📥');
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

const _placeholderCache = {};
function generatePlaceholderPhoto(name) {
    const key = name || '?';
    if (_placeholderCache[key]) return _placeholderCache[key];
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 80;
    const ctx = canvas.getContext('2d');
    // Deterministic hue from name
    let hash = 0;
    for (let i = 0; i < key.length; i++) hash = key.charCodeAt(i) + ((hash << 5) - hash);
    const hue = Math.abs(hash) % 360;
    ctx.fillStyle = `hsl(${hue}, 60%, 50%)`;
    ctx.beginPath();
    ctx.arc(40, 40, 40, 0, Math.PI * 2);
    ctx.fill();
    const url = canvas.toDataURL();
    _placeholderCache[key] = url;
    return url;
}

window.onload = init;
function onSegmentClick(sIdx) {
    // Toggle off if tapping same segment
    const next = highlightedSegmentIndex === sIdx ? -1 : sIdx;
    highlightedSegmentIndex = next;
    applyHighlight(next);
    socket.emit('set-highlight', {
        roomId: currentRoomId,
        pageIndex: currentPage,
        segmentIndex: next
    });
}

function applyHighlight(sIdx) {
    document.querySelectorAll('.text-segment').forEach(el => el.classList.remove('highlighted'));
    const target = document.getElementById(`seg-${currentPage}-${sIdx}`);
    if (target) {
        target.classList.add('highlighted');
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

function renderParagraphAvatars(taps) {
    // Clear all existing avatar clusters
    document.querySelectorAll('.para-avatars').forEach(el => el.remove());

    // Group taps by segmentIndex
    const bySegment = {};
    Object.values(taps || {}).forEach(tap => {
        if (tap.pageIndex !== currentPage) return;
        if (!bySegment[tap.segmentIndex]) bySegment[tap.segmentIndex] = [];
        bySegment[tap.segmentIndex].push(tap);
    });

    Object.entries(bySegment).forEach(([sIdx, users]) => {
        const seg = document.getElementById(`seg-${currentPage}-${sIdx}`);
        if (!seg) return;

        const cluster = document.createElement('div');
        cluster.className = 'para-avatars';

        users.slice(0, 5).forEach(u => {
            const av = document.createElement('div');
            av.className = 'para-avatar';
            av.title = u.name;
            if (u.photo && !u.photo.startsWith('data:') && !u.photo.startsWith('http')) {
                // Emoji avatar
                av.textContent = u.photo;
                av.style.fontSize = '14px';
                av.style.background = 'rgba(30,15,0,0.85)';
            } else if (u.photo) {
                const img = document.createElement('img');
                img.src = u.photo;
                img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:50%';
                av.appendChild(img);
            } else {
                av.textContent = (u.name || '?')[0];
            }
            cluster.appendChild(av);
        });

        seg.appendChild(cluster);
    });
}

function toggleLanguage() {
    // Cycle: he → en → translit → he
    if (currentLanguage === 'he') currentLanguage = 'en';
    else if (currentLanguage === 'en') currentLanguage = 'translit';
    else currentLanguage = 'he';

    const labels = { he: 'EN', en: 'Aa', translit: 'עב' };
    const sidebarLabels = { he: 'English', en: 'Transliteration', translit: 'עברית' };

    const sidebarBtn = $$('btn-toggle-lang');
    if (sidebarBtn) sidebarBtn.innerText = sidebarLabels[currentLanguage];
    const footerBtn = $$('btn-lang-toggle');
    if (footerBtn) {
        footerBtn.textContent = labels[currentLanguage];
        footerBtn.classList.toggle('active', currentLanguage !== 'he');
    }
    renderPage();
}

function toggleReading() {
    amReading = !amReading;
    socket.emit('toggle-reading', { roomId: currentRoomId });
    const btn = $$('btn-read-along');
    if (btn) {
        btn.classList.toggle('active', amReading);
        btn.title = amReading ? 'אתה קורא/ת — לחץ לביטול' : 'סמן שאני קורא/ת';
    }
    showToast(amReading ? '📖 סומנת כקורא/ת — התמונה הבאה תכלול אותך!' : '📖 הפסקת קריאה');
}

function updateReadersStrip() {
    const strip = document.getElementById('readers-strip');
    if (!strip) return;
    strip.innerHTML = '';
    if (activeReaders.length === 0) {
        strip.classList.add('hidden');
        return;
    }
    strip.classList.remove('hidden');
    const label = document.createElement('span');
    label.className = 'readers-label';
    label.textContent = `📖 ${activeReaders.length} קוראים יחד`;
    strip.appendChild(label);
    activeReaders.forEach(r => {
        if (r.photo) {
            const av = createAvatarEl(r.photo);
            av.className = (isEmojiPhoto(r.photo) ? 'emoji-avatar' : '') + ' reader-avatar';
            strip.appendChild(av);
        }
    });
}

// Google Auth removed — PIN-based host login is used instead

// ─────────────────────────────────────────────────────────────────────
// PLAGUE CONTEXT — modern parallels for each effect
// ─────────────────────────────────────────────────────────────────────
const PLAGUE_CONTEXT = {
    blood: {
        emoji: '🩸',
        ancient: 'דָּם — המים הפכו לדם',
        today: 'כיום: 2 מיליארד אנשים חסרי גישה למי שתייה נקיים.\nנהרות מזוהמים בפסולת תעשייתית — אתגר הדור.'
    },
    frogs: {
        emoji: '🐸',
        ancient: 'צְפַרְדֵּעַ — פלישת צפרדעים',
        today: 'כיום: פלישת מינים זרים הורסת אקוסיסטמות — \\n40% ממיני הדו-חיים בסכנת הכחדה.'
    },
    lice: {
        emoji: '🦟',
        ancient: 'כִּנִּים — חרקים בכל מקום',
        today: 'כיום: מחלות שמועברות על ידי חרקים (מלריה, דנגי) הורגות מעל 700,000 איש בשנה.'
    },
    darkness: {
        emoji: '🌑',
        ancient: 'חוֹשֶׁךְ — חושך מצרי שלוש ימים',
        today: 'כיום: 80% מהאנושות לא יכולים לראות את שביל החלב. זיהום אור מכסה את שמיינו.'
    },
    dayenu: {
        emoji: '🎉',
        ancient: 'דַּיֵּנוּ — היה לנו די!',
        today: 'על כל ברכה — על הבית, על המשפחה, על החרות — דַּיֵּנוּ!'
    },
    sea: {
        emoji: '🌊',
        ancient: 'קְרִיעַת יַם סוּף — הים נפרד',
        today: 'כיום: כל עם השואף לחרות זוכר את הים הנפרד — מסמל שהבלתי-אפשרי אפשרי.'
    }
};

function showPlagueContext(type) {
    const ctx = PLAGUE_CONTEXT[type];
    if (!ctx) return;
    const overlay = $$('plague-context-overlay');
    if (!overlay) return;
    $$('plague-ctx-emoji').textContent = ctx.emoji;
    $$('plague-ctx-ancient').textContent = ctx.ancient;
    $$('plague-ctx-today').textContent = ctx.today;
    overlay.classList.remove('hidden');
    clearTimeout(window._plagueCtxTimer);
    window._plagueCtxTimer = setTimeout(() => overlay.classList.add('hidden'), 6000);
}

// (plague context is called from within triggerLocalEffect below)

// ─────────────────────────────────────────────────────────────────────
// ENTRANCE ANIMATION — when a new participant joins the room
// ─────────────────────────────────────────────────────────────────────
let _prevParticipantIds = new Set();

function checkForNewParticipants(participants) {
    const currentIds = new Set(participants.map(p => p.id));
    participants.forEach(p => {
        if (!_prevParticipantIds.has(p.id) && p.id !== socket?.id) {
            showEntranceNotif(p);
        }
    });
    _prevParticipantIds = currentIds;
}

function showEntranceNotif(participant) {
    const el = $$('entrance-notif');
    if (!el) return;
    const isRealPhoto = participant.photo && (participant.photo.startsWith('data:') || participant.photo.startsWith('http'));
    const photoHtml = isRealPhoto
        ? `<img src="${participant.photo}" class="entrance-notif-avatar" alt="">`
        : `<span class="entrance-notif-avatar" style="background:#722f37;display:inline-flex;align-items:center;justify-content:center;font-size:1.2rem;">${participant.photo || '🙂'}</span>`;
    el.innerHTML = `${photoHtml}<span><span class="entrance-notif-name">${participant.name || 'אורח'}</span> הצטרף/ה לסדר 🍷</span>`;
    el.classList.remove('hidden');
    clearTimeout(window._entranceTimer);
    window._entranceTimer = setTimeout(() => el.classList.add('hidden'), 4000);
}

// ─────────────────────────────────────────────────────────────────────
// EMOJI REACTIONS — per-page emoji reactions with avatars
// ─────────────────────────────────────────────────────────────────────
const REACTION_EMOJIS = ['🙏', '😢', '🎉', '🤯', '❤️'];
let pageReactions = {}; // { pageIndex: { userId: emoji, ... } }

function renderReactionsBar(pageIndex) {
    const container = document.getElementById('reactions-bar-global');
    if (!container) return;
    const reactions = pageReactions[pageIndex] || {};
    const myReaction = reactions[socket?.id];

    // Count per emoji + collect avatars
    const counts = {};
    REACTION_EMOJIS.forEach(e => counts[e] = { count: 0, users: [] });
    Object.entries(reactions).forEach(([uid, emoji]) => {
        if (counts[emoji]) {
            counts[emoji].count++;
            const participant = Object.values(window._cachedParticipants || {}).find ? null : null;
            counts[emoji].users.push(uid);
        }
    });

    container.innerHTML = '';
    REACTION_EMOJIS.forEach(emoji => {
        const { count } = counts[emoji];
        const btn = document.createElement('button');
        btn.className = 'reaction-btn' + (myReaction === emoji ? ' mine' : '');
        btn.title = count > 0 ? `${count} אנשים` : '';
        btn.innerHTML = `${emoji}${count > 0 ? `<span class="reaction-count">${count}</span>` : ''}`;
        btn.onclick = () => sendReaction(pageIndex, emoji);
        container.appendChild(btn);
    });
}

function sendReaction(pageIndex, emoji) {
    if (!socket || !currentRoomId) return;
    socket.emit('page-react', { roomId: currentRoomId, pageIndex, emoji });
}

// Called from setupSocket() reactions-updated handler
function onReactionsUpdated({ pageIndex, reactions }) {
    pageReactions[pageIndex] = reactions;
    if (pageIndex === currentPage) renderReactionsBar(pageIndex);
}

// ─────────────────────────────────────────────────────────────────────
// GALLERY DOWNLOAD
// ─────────────────────────────────────────────────────────────────────
async function downloadGallery() {
    const entries = Object.entries(pageImages).sort((a, b) => Number(a[0]) - Number(b[0]));
    if (entries.length === 0) { showToast('אין תמונות להורדה'); return; }
    showToast(`מוריד ${entries.length} תמונות... 📥`);
    for (const [idx, imageData] of entries) {
        const url = typeof imageData === 'string' ? imageData : imageData?.url;
        if (!url) continue;
        try {
            const res = await fetch(url);
            const blob = await res.blob();
            const objUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = objUrl;
            a.download = `pesach-seder-${Number(idx) + 1}.jpg`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(objUrl);
            await new Promise(r => setTimeout(r, 400));
        } catch {
            // CORS may block direct fetch — open in new tab as fallback
            window.open(url, '_blank');
            await new Promise(r => setTimeout(r, 600));
        }
    }
    showToast('הורדה הסתיימה! 🎉');
}
window.downloadGallery = downloadGallery;

// ─────────────────────────────────────────────────────────────────────
// מי יודע — interactive AI image generator
// ─────────────────────────────────────────────────────────────────────
const MI_YODEA_NUMS_HE = ['','אֶחָד','שְׁנַיִם','שְׁלֹשָׁה','אַרְבָּעָה','חֲמִשָּׁה',
    'שִׁשָּׁה','שִׁבְעָה','שְׁמֹנָה','תִּשְׁעָה','עֲשָׂרָה','אַחַד עָשָׂר','שְׁנֵים עָשָׂר','שְׁלֹשָׁה עָשָׂר'];
let miYodeaSlots = {}; // { slotNum: [{ id, name, photo }, ...] }
let miYodeaImages = {}; // { slotNum: imageUrl }

function openMiYodea() {
    const modal = $$('mi-yodea-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    renderMiYodeaGrid();
}
function closeMiYodea() {
    const modal = $$('mi-yodea-modal');
    if (modal) modal.classList.add('hidden');
}
window.closeMiYodea = closeMiYodea;
window.openMiYodea = openMiYodea;

function renderMiYodeaGrid() {
    const grid = $$('mi-yodea-grid');
    if (!grid) return;
    grid.innerHTML = '';
    for (let n = 1; n <= 13; n++) {
        grid.appendChild(buildMiYodeaSlot(n));
    }
}

function buildMiYodeaSlot(n) {
    const participants = miYodeaSlots[n] || [];
    const imageUrl = miYodeaImages[n];
    const iAmIn = participants.some(p => p.id === socket?.id);
    const isFull = participants.length >= 6;
    const isLeader = amIAllowedLeader();

    const slot = document.createElement('div');
    slot.className = 'mi-yodea-slot' + (imageUrl ? ' has-image' : '') + (iAmIn ? ' i-am-in' : '');
    slot.id = `mi-slot-${n}`;

    // Image thumbnail (if generated)
    if (imageUrl) {
        const img = document.createElement('img');
        img.src = imageUrl;
        img.className = 'mi-yodea-thumb';
        img.onclick = () => openPhotoZoom(imageUrl);
        slot.appendChild(img);
    }

    // Number
    const numEl = document.createElement('div');
    numEl.className = 'mi-yodea-num';
    numEl.textContent = n;
    slot.appendChild(numEl);

    const hebEl = document.createElement('div');
    hebEl.className = 'mi-yodea-heb';
    hebEl.textContent = MI_YODEA_NUMS_HE[n];
    slot.appendChild(hebEl);

    // Avatars
    const avDiv = document.createElement('div');
    avDiv.className = 'mi-yodea-avatars';
    participants.forEach(p => {
        if (p.photo) {
            const img = document.createElement('img');
            img.src = p.photo;
            img.title = p.name || '';
            avDiv.appendChild(img);
        } else {
            const sp = document.createElement('span');
            sp.textContent = (p.name || '?')[0];
            sp.title = p.name || '';
            avDiv.appendChild(sp);
        }
    });
    if (participants.length === 0) {
        const ph = document.createElement('span');
        ph.style.opacity = '0.3';
        ph.textContent = '—';
        avDiv.appendChild(ph);
    }
    slot.appendChild(avDiv);

    // Volunteer button
    const volBtn = document.createElement('button');
    volBtn.className = 'mi-yodea-volunteer-btn' + (iAmIn ? ' active' : '');
    volBtn.textContent = iAmIn ? '✓ אני בפנים!' : (isFull ? '6/6 מלא' : '+ אני רוצה!');
    volBtn.disabled = !iAmIn && isFull;
    volBtn.onclick = () => toggleMiYodeaVolunteer(n, iAmIn);
    slot.appendChild(volBtn);

    // Generate button — disabled to save tokens

    return slot;
}

function toggleMiYodeaVolunteer(slotNum, isCurrentlyIn) {
    if (!socket || !currentRoomId || !me) return;
    const event = isCurrentlyIn ? 'mi-yodea-leave' : 'mi-yodea-join';
    socket.emit(event, { roomId: currentRoomId, slotNum, participant: { id: socket.id, name: me.name, photo: me.photo || null } });
}

function triggerMiYodeaGenerate(slotNum) {
    if (!socket || !currentRoomId) return;
    socket.emit('mi-yodea-generate', { roomId: currentRoomId, slotNum });
    showToast(`✨ מייצר תמונה ל-${slotNum}...`);
    const slot = $$(`mi-slot-${slotNum}`);
    if (slot) {
        const genBtn = slot.querySelector('.mi-yodea-generate-btn');
        if (genBtn) { genBtn.textContent = '⏳ מייצר...'; genBtn.disabled = true; }
    }
}

function onMiYodeaUpdated({ slotNum, participants }) {
    miYodeaSlots[slotNum] = participants;
    const slotEl = $$(`mi-slot-${slotNum}`);
    if (slotEl) {
        const newSlot = buildMiYodeaSlot(slotNum);
        slotEl.replaceWith(newSlot);
    }
}

function onMiYodeaImageReady({ slotNum, imageUrl }) {
    miYodeaImages[slotNum] = imageUrl;
    // Also add to gallery
    pageImages[`mi-yodea-${slotNum}`] = { url: imageUrl, featuredPhotos: miYodeaSlots[slotNum]?.map(p => p.photo) };
    const slotEl = $$(`mi-slot-${slotNum}`);
    if (slotEl) {
        const newSlot = buildMiYodeaSlot(slotNum);
        slotEl.replaceWith(newSlot);
    }
    showToast(`✨ תמונה ${slotNum} מוכנה!`);
}
