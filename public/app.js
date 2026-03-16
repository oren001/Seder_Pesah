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

// --- Staging State ---
let isFollowingLeader = true;
let leaderId = null;
let leaderName = null;
let leaderPage = 0;
let currentLanguage = 'he'; // 'he' or 'translit'
let highlightedSegmentIndex = -1;
let amReading = false;
let activeReaders = [];

// Co-leader emails — mirrors server.js LEADERS
const ALLOWED_LEADERS = ['oren001@gmail.com', 'itai.shultz@hotmail.com'];
function amIAllowedLeader() {
    return !!(me && me.email && ALLOWED_LEADERS.includes(me.email.toLowerCase()));
}

// --- Giggle Easter Egg (שָׁדַיִם) ---
// Matches shin-dalet-yod-(yod)-mem-sofit with any nikkud in between
const _NIK = '[\u05B0-\u05BD\u05BF\u05C1\u05C2\u05BC]*';
const GIGGLE_RE = new RegExp(
    '\u05E9' + _NIK + '\u05D3' + _NIK + '\u05D9' + _NIK + '\u05D9?' + _NIK + '\u05DD', 'g'
);

function wrapGiggleWords(html) {
    return html.replace(GIGGLE_RE, '<span class="giggle-word" onclick="playGiggle(event)">$&</span>');
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
    lobby: $$('lobby-screen'),
    rsvp: $$('rsvp-screen'),
    roomLobby: $$('room-lobby-screen'),
    room: $$('room-screen')
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
    return img;
}

// --- Init ---
function init() {
    const navType = performance.getEntriesByType('navigation')[0]?.type;
    console.log(`[Init] App starting... (Navigation: ${navType}, Time: ${Date.now()})`);

    setupSocket();
    setupTasks();
    requestWakeLock();

    // Initialize Exodus Map
    exodusMap = new ExodusMap('exodus-map-root');

    // Initialize RSVP Flow
    rsvpFlow = new RSVPFlow({
        onComplete: (data) => {
            console.log('[RSVP] Flow complete:', data);
            
            // If we're a guest (not logged in with Google), create a dummy user
            if (!window.me) {
                const guestName = data.name || 'אורח ' + Math.floor(Math.random() * 900 + 100);
                window.me = {
                    id: 'guest_' + Math.random().toString(36).substr(2, 9),
                    name: guestName,
                    isGuest: true
                };
                localStorage.setItem('haggadah-user', JSON.stringify(window.me));
            }

            if (currentRoomId) {
                // Updating existing profile
                socket.emit('update-profile', { roomId: currentRoomId, photo: data.photo });
                showScreen('roomLobby');
            } else if (pendingRoomId) {
                // Joining for the first time
                joinRoom(pendingRoomId, data);
            } else {
                // No room context — go back to lobby
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
    safeAddListener('btn-create-room', 'click', onCreateRoom);
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
    safeAddListener('btn-lobby-copy-link', 'click', onCopyLink);
    
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

    // Load persisted selfie
    const savedSelfie = localStorage.getItem('haggadah_selfie');
    if (savedSelfie) {
        selfieDataUrl = savedSelfie;
    }

    if (roomFromUrl) {
        pendingRoomId = roomFromUrl;
        if (me) {
            // If we have a saved selfie and are logged in, join automatically
            const savedSelfie = localStorage.getItem('haggadah_selfie');
            if (savedSelfie) {
                console.log('[Init] Auto-joining with saved selfie...');
                joinRoom(pendingRoomId);
            } else {
                rsvpFlow.show();
            }
        } else {
            // Show auth, but hide actions to avoid empty space
            showScreen('lobby');
            $$('lobby-auth-section').classList.remove('hidden');
            $$('lobby-actions-section').classList.add('hidden');
            showToast('הוזמנת לסדר! התחבר כדי להצטרף 🍷');
        }
    } else {
        showScreen('lobby');
        if (me) {
            $$('lobby-auth-section').classList.add('hidden');
            $$('lobby-actions-section').classList.remove('hidden');
        } else {
            $$('lobby-auth-section').classList.remove('hidden');
            $$('lobby-actions-section').classList.add('hidden');
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
        renderParticipants(data.participants);
        renderLobbyParticipants(data.participants);
        leaderId = data.leaderId;
        leaderName = data.leaderName;
        leaderPage = data.currentPage;

        updateLeadershipUI();
        updateLobbyUI(data.sederStarted);

        if (isFollowingLeader && data.currentPage !== currentPage) {
            currentPage = data.currentPage;
            renderPage();
        }
    });

    socket.on('seder-started', (data) => {
        showScreen('room');
        currentPage = data.currentPage || 0;
        renderPage();
        showToast('🍷 הסדר מתחיל! חג שמח!');
        confetti({
            particleCount: 150,
            spread: 70,
            origin: { y: 0.6 }
        });
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
}

function triggerPageGeneration(pageIndex) {
    if (!currentRoomId) return;

    // --- Leader Check (Client Side) ---
    if (leaderId !== socket.id && !amIAllowedLeader()) {
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
async function requestWakeLock() {
    if ('wakeLock' in navigator) {
        try {
            wakeLock = await navigator.wakeLock.request('screen');
            console.log('Wake Lock is active');
            wakeLock.addEventListener('release', () => {
                console.log('Wake Lock was released');
            });
        } catch (err) {
            console.error(`${err.name}, ${err.message}`);
        }
    }
}

// Re-request wake lock when page becomes visible again
document.addEventListener('visibilitychange', async () => {
    if (wakeLock !== null && document.visibilityState === 'visible') {
        requestWakeLock();
    }
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
                       <button onclick="location.reload(true)" class="btn primary tiny" style="margin-top:10px; padding: 5px 15px; font-size: 0.9rem;">רענן עכשיו 🔄</button>`;
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
    socket.emit('create-room', (response) => {
        pendingRoomId = response.roomId;
        rsvpFlow.show();
    });
}

function onJoinWithPhoto() {
    if (!pendingRoomId) return;
    stopCamera();
    joinRoom(pendingRoomId);
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
    
    socket.emit('join-room', { roomId, photo, userEmail }, (response) => {
        if (response.success) {
            currentRoomId = response.roomId;
            // MERGE identity to preserve email
            me = { ...me, ...response.participant };
            
            // Sync leader from response
            leaderId = response.leaderId;
            leaderName = response.leaderName;
            
            leaderPage = response.currentPage;
            currentPage = response.currentPage;
            if (response.images) Object.assign(pageImages, response.images);
            if (response.tasks) roomTasks = response.tasks;

            $$('total-pages').textContent = HAGGADAH.length;
            
            // Host Admin check for bobomomo
            const isHost = me.name === 'bobomomo234@gmail.com' || me.email === 'bobomomo234@gmail.com';
            const leadToggle = document.querySelector('.lead-mode-toggle');
            if (leadToggle) {
                leadToggle.style.display = isHost ? 'flex' : 'none';
                if (!isHost) {
                    $$('check-lead-mode').checked = false;
                }
            }

            updateUrlParam('room', currentRoomId);
            
            if (response.sederStarted) {
                showScreen('room');
                renderPage();
            } else {
                showScreen('roomLobby');
                renderLobbyParticipants(response.participants || [response.participant]);
                updateLobbyUI(false);
            }
            renderTasks();
            updateLeadershipUI();
            startHeartbeat(currentRoomId);

            // Auto-enable lead mode for the leader
            const amILeader = (response.leaderId === socket.id) || amIAllowedLeader();
            if (amILeader) {
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
    renderParticipants(participants);
    if (pg !== currentPage) {
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

    list.innerHTML = '';
    if (gazeboList) gazeboList.innerHTML = '';

    participants.forEach(p => {
        const photoUrl = p.photo || generatePlaceholderPhoto();
        const isOnline = p.online !== false;
        
        // Header Strip
        const div = document.createElement('div');
        div.className = 'avatar' + (me && p.id === me.id ? ' me' : '') + (!isOnline ? ' offline' : '');
        div.appendChild(createAvatarEl(photoUrl));
        list.appendChild(div);

        // Gazebo Grid
        if (gazeboList) {
            const gazDiv = document.createElement('div');
            gazDiv.className = 'gazebo-avatar' + (!isOnline ? ' offline' : '');
            gazDiv.onclick = () => openPhotoZoom(photoUrl);
            gazDiv.appendChild(createAvatarEl(photoUrl));
            gazeboList.appendChild(gazDiv);
        }
    });
}

function renderLobbyParticipants(participants) {
    const grid = $$('room-lobby-participants');
    if (!grid) return;
    grid.innerHTML = '';

    participants.forEach(p => {
        const photoUrl = p.photo || generatePlaceholderPhoto();

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
        wrapper.appendChild(nameLabel);

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
    
    // Co-leaders always count as leader for UI purposes
    const isLeader = (leaderId === socket.id) || amIAllowedLeader();

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
            
            // If not a co-leader, but logged in as someone else (not guest)
            if (me && !me.isGuest && !amIAllowedLeader()) {
                guestNote.innerHTML = '👤 מחובר כאורח. המנחה יתחיל את הסדר בקרוב... ✨';
            } 
            // If Guest or not logged in at all
            else if (!me || me.isGuest) {
                guestNote.innerHTML = `
                    <div id="g-login-lobby" style="margin-top: 1.5rem; padding: 1rem; background: rgba(0,0,0,0.03); border-radius: 12px; border: 1px solid rgba(0,0,0,0.1);">
                        <p style="margin-bottom: 0.8rem; font-weight: 600;">מנהל הסדר? התחבר כאן:</p>
                        <div id="g_id_onload"
                            data-client_id="256326772055-e29p61798pa9npj533mb08i05en55956.apps.googleusercontent.com"
                            data-callback="handleGoogleResponse">
                        </div>
                        <div class="g_id_signin" data-type="standard"></div>
                    </div>
                `;
                // Re-init Google button if needed
                setTimeout(() => {
                    if (window.google) window.google.accounts.id.renderButton(
                        document.querySelector(".g_id_signin"),
                        { theme: "outline", size: "large", text: "continue_with" }
                    );
                }, 100);
            }
        }
    }

    // Hide the host login section if we are the leader; show and init it otherwise
    const hostLoginBox = $$('lobby-host-login');
    if (hostLoginBox) {
        if (isLeader) {
            hostLoginBox.style.display = 'none';
        } else {
            hostLoginBox.style.display = '';
            setTimeout(() => {
                const signinDiv = document.querySelector('.g_id_signin_lobby');
                if (signinDiv && window.google && !signinDiv.hasChildNodes()) {
                    google.accounts.id.initialize({
                        client_id: '256326772055-e29p61798pa9npj533mb08i05en55956.apps.googleusercontent.com',
                        callback: handleGoogleResponse
                    });
                    google.accounts.id.renderButton(signinDiv, { 
                        theme: 'outline', size: 'medium', text: 'continue_with'
                    });
                }
            }, 200);
        }
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
            downloadImage(currentImgUrl, `Haggadah_Page_${index + 1}.png`);
        };
        const hint = document.createElement('div');
        hint.className = 'download-hint';
        hint.innerHTML = '📥 לחץ להורדה';
        imgZone.appendChild(hint);
        imgZone.appendChild(img);
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

        // --- Title ---
        const titleDiv = document.createElement('div');
        titleDiv.className = 'page-title';
        titleDiv.textContent = isTranslit ? transliterate(page.title) : page.title;
        if (isTranslit) titleDiv.classList.add('translit-text');
        el.appendChild(titleDiv);

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
        textBefore.className = 'page-text' + (isTranslit ? ' ltr-mode' : '');

        // --- Text (after image, only for long pages) ---
        const textAfter = document.createElement('div');
        textAfter.className = 'page-text page-text-after' + (isTranslit ? ' ltr-mode' : '');
        let hasAfterText = false;

        if (segments.length > 0) {
            segments.forEach((seg, sIdx) => {
                const p = document.createElement('p');
                p.className = 'text-segment';
                p.id = `seg-${index}-${sIdx}`;
                if (isTranslit) {
                    const transText = transliterate(seg.he);
                    // Giggle easter egg in translit mode too
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
            if (isTranslit) {
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

        $$('current-page-num').textContent = currentPage + 1;
        $$('total-pages').textContent = HAGGADAH.length;
        $$('btn-prev').disabled = currentPage === 0;
        $$('btn-next').disabled = currentPage === HAGGADAH.length - 1;

        updateMealProgress();

        // Sync button visibility
        const syncBtn = $$('btn-sync');
        const isLeading = $$('check-lead-mode').checked;
        if (isLeading || (isFollowingLeader && currentPage === leaderPage)) {
            syncBtn.classList.add('hidden');
        } else {
            syncBtn.classList.remove('hidden');
        }

        el.style.opacity = '1';

        // Scroll page content to top on page change
        const container = document.querySelector('.haggadah-container');
        if (container) container.scrollTop = 0;
    }, 180);
}

function changePage(delta) {
    const next = currentPage + delta;
    if (next >= 0 && next < HAGGADAH.length) {
        const isLeading = $$('check-lead-mode').checked;
        const amILeader = (leaderId === socket.id) || amIAllowedLeader();

        if (isLeading || amILeader) {
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

    const amILeader = (leaderId === socket.id) || amIAllowedLeader();

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

    // Crucial: Also update Lobby if we are in it
    updateLobbyUI(false);
}

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
    if (socket && $$('check-lead-mode').checked) {
        socket.emit('trigger-effect', { roomId: currentRoomId, effectType });
    } else {
        triggerLocalEffect(effectType);
    }
}

function triggerLocalEffect(type) {
    const container = $$('effects-container');
    if (!container) return;

    console.log(`[Effect] Triggering local effect: ${type}`);
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
    } else if (type === 'sea') {
        const leftWave = document.createElement('div');
        leftWave.className = 'sea-wave-left';
        const rightWave = document.createElement('div');
        rightWave.className = 'sea-wave-right';
        container.appendChild(leftWave);
        container.appendChild(rightWave);

        // Let them stay for a bit then hide
        setTimeout(() => {
            container.classList.add('hidden');
        }, 5000);
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
        // Find index of "Shulchan Orech" if it exists, otherwise use total
        const dinnerIndex = HAGGADAH.findIndex(p => p.title.includes('שולחן עורך'));
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

// Global exposure for onclick
window.closePhotoZoom = closePhotoZoom;
window.toggleLanguage = toggleLanguage;
window.onSegmentClick = onSegmentClick;

// --- Utils ---
function showScreen(name) {
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

function generatePlaceholderPhoto() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 80;
    const ctx = canvas.getContext('2d');
    const hue = Math.floor(Math.random() * 360);
    ctx.fillStyle = `hsl(${hue}, 60%, 50%)`;
    ctx.beginPath();
    ctx.arc(40, 40, 40, 0, Math.PI * 2);
    ctx.fill();
    return canvas.toDataURL();
}

window.onload = init;
function onSegmentClick(sIdx) {
    highlightedSegmentIndex = sIdx;
    applyHighlight(sIdx);
    socket.emit('set-highlight', {
        roomId: currentRoomId,
        pageIndex: currentPage,
        segmentIndex: sIdx
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

function toggleLanguage() {
    currentLanguage = currentLanguage === 'he' ? 'translit' : 'he';
    // Update all language buttons
    const sidebarBtn = $$('btn-toggle-lang');
    if (sidebarBtn) sidebarBtn.innerText = currentLanguage === 'he' ? 'English' : 'עברית';
    const footerBtn = $$('btn-lang-toggle');
    if (footerBtn) {
        footerBtn.textContent = currentLanguage === 'he' ? 'EN' : 'עב';
        footerBtn.classList.toggle('active', currentLanguage === 'translit');
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

// --- Google Auth ---
function handleGoogleResponse(response) {
    const credential = response.credential;
    console.log('Google credential received');
    
    // Save credential for session persistence
    localStorage.setItem('haggadah-google-cred', credential);
    
    if (socket) {
        socket.emit('google-login', { credential });
    } else {
        console.error('Socket not initialized during Google login');
    }
}

window.handleGoogleResponse = handleGoogleResponse;
