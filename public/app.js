// --- State ---
let socket;
let pendingRoomId = null;
let selfieDataUrl = null;
let me = null;
let currentRoomId = null;
let currentPage = 0;
const pageImages = {};  // { [pageIndex]: imageUrl } — grows as AI generates images
let roomState = null;
let currentVersion = null;
let wakeLock = null;
let exodusMap = null;
let rsvpFlow = null;

// --- Staging State ---
let isFollowingLeader = true;
let leaderId = null;
let leaderName = null;
let leaderPage = 0;
let currentLanguage = 'he'; // 'he' or 'en'
let highlightedSegmentIndex = -1;

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
        // Guest login triggers the RSVP flow directly
        rsvpFlow.show();
    });
    safeAddListener('btn-join-with-photo', 'click', onJoinWithPhoto);
    safeAddListener('btn-copy-link', 'click', onCopyLink);
    safeAddListener('btn-prev', 'click', () => changePage(-1));
    safeAddListener('btn-next', 'click', () => changePage(1));
    safeAddListener('btn-sync', 'click', onSyncWithLeader);
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


    // Auto-login from storage
    const storedUser = localStorage.getItem('haggadah-user');
    if (storedUser) {
        me = JSON.parse(storedUser);
        console.log('[Auth] Restored user:', me.name);
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

    socket.on('connect', () => {
        console.log('[Socket] Connected to server. Socket ID:', socket.id);

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
    });
}

function triggerPageGeneration(pageIndex) {
    if (!currentRoomId) return;

    // --- Leader Check (Client Side) ---
    if (leaderId !== socket.id) {
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

        // Show version in sidebar footer if it exists
        const versionEl = document.getElementById('version-display');
        if (versionEl) versionEl.textContent = `גרסה: ${data.version}`;

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

function joinRoom(roomId, rsvpData = null) {
    const photo = rsvpData ? rsvpData.photo : (localStorage.getItem('haggadah_selfie') || selfieDataUrl || generatePlaceholderPhoto());
    
    socket.emit('join-room', { roomId, photo }, (response) => {
        if (response.success) {
            currentRoomId = response.roomId;
            me = response.participant;
            
            // Sync leader from response
            leaderId = response.leaderId;
            leaderName = response.leaderName;
            
            leaderPage = response.currentPage;
            currentPage = response.currentPage;
            if (response.images) Object.assign(pageImages, response.images);
            if (response.tasks) roomTasks = response.tasks;

            $$('total-pages').textContent = HAGGADAH.length;
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
            updateLeadershipUI(); // Ensure leadership UI is correct (host badge etc)
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
        const img = document.createElement('img');
        img.src = photoUrl;
        img.alt = 'משתתף';
        div.appendChild(img);
        list.appendChild(div);

        // Gazebo Grid
        if (gazeboList) {
            const gazDiv = document.createElement('div');
            gazDiv.className = 'gazebo-avatar' + (!isOnline ? ' offline' : '');
            gazDiv.onclick = () => openPhotoZoom(photoUrl);
            const gazImg = document.createElement('img');
            gazImg.src = photoUrl;
            gazDiv.appendChild(gazImg);
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
        const card = document.createElement('div');
        card.className = 'gazebo-avatar';
        card.style.width = '100px';
        card.style.height = '100px';
        
        const img = document.createElement('img');
        img.src = photoUrl;
        card.appendChild(img);
        
        grid.appendChild(card);
    });
}

function updateLobbyUI(sederStarted) {
    if (sederStarted) return;
    
    const isLeader = leaderId === socket.id;
    const leaderActions = $$('lobby-leader-actions');
    const guestNote = $$('lobby-guest-note');
    
    if (leaderActions) {
        if (isLeader) {
            leaderActions.classList.remove('hidden');
            if (guestNote) guestNote.classList.add('hidden');
        } else {
            leaderActions.classList.add('hidden');
            if (guestNote) guestNote.classList.remove('hidden');
        }
    }
}

function onStartSeder() {
    if (!currentRoomId) return;
    socket.emit('start-seder', { roomId: currentRoomId });
}


function renderPage() {
    const page = HAGGADAH[currentPage];
    if (!page) return;

    // Update Gazebo Extras
    updateMealProgress();
    if (exodusMap) exodusMap.updateProgress(currentPage, HAGGADAH.length);

    const el = $$('haggadah-pages');
    if (!el) return;

    const imageData = pageImages[currentPage];
    const index = currentPage;

    el.style.opacity = '0';
    setTimeout(() => {
        el.innerHTML = '';

        const titleDiv = document.createElement('div');
        titleDiv.className = 'page-title';
        titleDiv.textContent = page.title;
        el.appendChild(titleDiv);

        const imgWrap = document.createElement('div');
        imgWrap.className = 'page-image-wrap';
        imgWrap.id = `img-wrap-${index}`;
        imgWrap.className = 'page-image-wrap';
        imgWrap.id = `img-wrap-${index}`;

        const overlay = document.createElement('div');
        overlay.className = 'status-overlay hidden';
        overlay.id = `status-overlay-${index}`;
        overlay.innerHTML = `
            <div class="status-text">מייצר תמונה...</div>
            <div class="status-log">לחץ כאן כדי להתחיל</div>
        `;
        imgWrap.appendChild(overlay);

        if (imageData) {
            const currentImgUrl = typeof imageData === 'string' ? imageData : imageData.url;
            const img = document.createElement('img');
            img.src = currentImgUrl;
            img.className = 'page-image has-image';
            img.alt = page.title;

            // --- Click to Download (Instead of generate) ---
            imgWrap.onclick = (e) => {
                e.stopPropagation();
                downloadImage(currentImgUrl, `Haggadah_Page_${index + 1}.png`);
            };

            // Add download hint
            const hint = document.createElement('div');
            hint.className = 'download-hint';
            hint.innerHTML = 'לחץ להורדה 📥';
            imgWrap.appendChild(hint);

            imgWrap.appendChild(img);

            // Add featured participants bubbles if present
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
                imgWrap.appendChild(bubblesContainer);
            }
        } else {
            const shimmer = document.createElement('div');
            shimmer.className = 'image-shimmer';
            imgWrap.appendChild(shimmer);

            // Click to Generate ONLY if NO image exists
            imgWrap.onclick = () => triggerPageGeneration(index);

            // Show overlay with manual prompt
            overlay.classList.remove('hidden');
            overlay.querySelector('.status-text').innerText = 'אין תמונה עדיין';
            overlay.querySelector('.status-log').innerText = 'לחץ כאן כדי לייצר עם AI';
        }

        el.appendChild(imgWrap);

        const textDiv = document.createElement('div');
        textDiv.className = 'page-text' + (currentLanguage === 'en' ? ' ltr-mode' : '');

        if (page.segments && page.segments.length > 0) {
            page.segments.forEach((seg, sIdx) => {
                const span = document.createElement('span');
                span.className = 'text-segment';
                span.id = `seg-${index}-${sIdx}`;
                span.innerText = currentLanguage === 'he' ? seg.he : (seg.en || seg.he);
                if (currentLanguage === 'en') span.classList.add('ltr');
                span.onclick = () => onSegmentClick(sIdx);
                if (highlightedSegmentIndex === sIdx) span.classList.add('highlighted');
                textDiv.appendChild(span);
                textDiv.appendChild(document.createTextNode(' '));
            });
        } else {
            textDiv.innerText = page.text || "";
        }

        el.appendChild(textDiv);

        $$('current-page-num').textContent = currentPage + 1;
        $$('btn-prev').disabled = currentPage === 0;
        $$('btn-next').disabled = currentPage === HAGGADAH.length - 1;

        updateMealProgress();

        // Sync button visibility
        const syncBtn = $$('btn-sync');
        const isLeading = $$('check-lead-mode').checked;

        if (isLeading) {
            syncBtn.classList.add('hidden');
        } else if (!isFollowingLeader || currentPage !== leaderPage) {
            syncBtn.classList.remove('hidden');
        } else {
            syncBtn.classList.add('hidden');
        }

        el.style.opacity = '1';
    }, 180);
}

function changePage(delta) {
    const next = currentPage + delta;
    if (next >= 0 && next < HAGGADAH.length) {
        const isLeading = $$('check-lead-mode').checked;

        if (isLeading) {
            // Global move
            currentPage = next;
            socket.emit('change-page', { roomId: currentRoomId, pageIndex: next });
        } else {
            // Local move (Free Browsing / Freedom)
            isFollowingLeader = false;
            currentPage = next;
            updateLeadershipUI();
        }

        renderPage();

        // Auto-trigger effects based on page
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

    if (isFollowingLeader || leaderId === socket.id) {
        syncBtn.classList.add('hidden');
    } else {
        syncBtn.classList.remove('hidden');
    }

    if (leaderId === socket.id) {
        statusText.innerHTML = '👑 אתה עורך הסדר';
        statusText.classList.add('is-leading');
    } else if (leaderId) {
        statusText.innerHTML = `👤 מנחה: ${leaderName}`;
        statusText.classList.remove('is-leading');
    } else {
        statusText.innerHTML = '🛡️ מחפש מנהל...';
        statusText.classList.remove('is-leading');
    }
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
    if (text) {
        // Find index of "Shulchan Orech" if it exists, otherwise use total
        const dinnerIndex = HAGGADAH.findIndex(p => p.title.includes('שולחן עורך'));
        if (dinnerIndex !== -1) {
            const remaining = dinnerIndex - currentPage;
            if (remaining > 0) {
                text.textContent = `נשארו עוד ${remaining} דפים עד לאוכל 🍗`;
            } else if (remaining === 0) {
                text.textContent = `בתיאבון! שולחן עורך כאן 🍷🍗`;
            } else {
                text.textContent = `אנחנו אחרי האוכל, ממשיכים בהלל! 🍷`;
            }
        } else {
            text.textContent = `${percent}% מההגדה מאחורינו`;
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
    currentLanguage = currentLanguage === 'he' ? 'en' : 'he';
    const btn = $$('btn-toggle-lang');
    if (btn) btn.innerText = currentLanguage === 'he' ? 'English' : 'עברית';
    renderPage();
}

// --- Google Auth ---
function handleGoogleResponse(response) {
    const credential = response.credential;
    console.log('Google credential received');
    if (socket) {
        socket.emit('google-login', { credential });
    } else {
        console.error('Socket not initialized during Google login');
    }
}

window.handleGoogleResponse = handleGoogleResponse;
