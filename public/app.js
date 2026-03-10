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

// --- Staging State ---
let isSyncingWithLeader = true;
let leaderPage = 0;
let currentLanguage = 'he'; // 'he' or 'en'
let highlightedSegmentIndex = -1;

// --- DOM refs ---
const $$ = id => document.getElementById(id);

const screens = {
    lobby: $$('lobby-screen'),
    selfie: $$('selfie-screen'),
    room: $$('room-screen')
};

let roomTasks = [];

// --- Init ---
function init() {
    setupSocket();
    setupTasks();
    requestWakeLock();

    // Register PWA Service Worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(err => {
            console.warn('SW registration failed:', err);
        });
    }

    // Start version polling
    checkVersion();
    setInterval(checkVersion, 30000); // Check every 30 seconds for faster feedback during dev

    // Add event listeners
    $$('btn-create-room').addEventListener('click', onCreateRoom);
    $$('btn-take-selfie').addEventListener('click', onTakeSelfie);
    $$('btn-retake').addEventListener('click', onRetake);
    $$('btn-join-with-photo').addEventListener('click', onJoinWithPhoto);
    $$('btn-copy-link').addEventListener('click', onCopyLink);
    $$('btn-prev').addEventListener('click', () => changePage(-1));
    $$('btn-next').addEventListener('click', () => changePage(1));
    $$('btn-sync').addEventListener('click', onSyncWithLeader);
    $$('check-lead-mode').addEventListener('change', () => {
        if ($$('check-lead-mode').checked) {
            isSyncingWithLeader = true; // If you become leader, you are by definition 'synced' with yourself
        }
        renderPage();
    });

    // Task Sidebar
    $$('btn-toggle-tasks').addEventListener('click', toggleTasks);
    $$('btn-close-tasks').addEventListener('click', toggleTasks);
    $$('btn-add-task').addEventListener('click', addTask);
    $$('input-new-task').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addTask();
    });

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
        if (selfieDataUrl) {
            // If we have both, just join
            joinRoom(roomFromUrl);
        } else {
            showScreen('selfie');
            startCamera();
        }
    } else {
        showScreen('lobby');
    }
}

async function setupSocket() {
    socket = io();

    socket.on('connect', () => {
        console.log('Connected to server');
    });

    socket.on('room-updated', (data) => {
        renderParticipants(data.participants);
        leaderPage = data.currentPage;
        if (isSyncingWithLeader && data.currentPage !== currentPage) {
            currentPage = data.currentPage;
            renderPage();
        }
    });

    socket.on('page-changed', (data) => {
        leaderPage = data.currentPage;
        if (isSyncingWithLeader) {
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

    socket.on('image-ready', ({ pageIndex, imageUrl }) => {
        pageImages[pageIndex] = imageUrl;
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
        showToast(`ברוך הבא, ${userData.name}!`);
        // After login, you can create or join
        const authSection = document.getElementById('lobby-auth-section');
        const actionsSection = document.getElementById('lobby-actions-section');
        if (authSection) authSection.classList.add('hidden');
        if (actionsSection) actionsSection.classList.remove('hidden');
    });
}

function triggerPageGeneration(pageIndex) {
    if (!currentRoomId) return;
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
        t.innerHTML = '✨ <b>גרסה חדשה מוכנה!</b> <br> מומלץ לרענן את העמוד כדי לקבל את העדכונים האחרונים. <br> <a href="javascript:location.reload()" style="color:#ffd700;text-decoration:underline;">לחץ כאן לרענון עכשיו</a>';
        t.classList.remove('hidden');
        t.classList.add('show');
    } else {
        console.warn('Toast element missing for version notification');
    }
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
        showScreen('selfie');
        startCamera();
    });
}

function onJoinWithPhoto() {
    if (!pendingRoomId) return;
    stopCamera();
    joinRoom(pendingRoomId);
}

function joinRoom(roomId) {
    const photo = selfieDataUrl || generatePlaceholderPhoto();
    socket.emit('join-room', { roomId, photo }, (response) => {
        if (response.success) {
            currentRoomId = response.roomId;
            me = response.participant;
            leaderPage = response.currentPage;
            currentPage = response.currentPage;
            if (response.images) Object.assign(pageImages, response.images);
            if (response.tasks) roomTasks = response.tasks;

            $$('total-pages').textContent = HAGGADAH.length;
            updateUrlParam('room', currentRoomId);
            showScreen('room');
            renderPage();
            renderTasks();
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
    if (isSyncingWithLeader) {
        currentPage = newPage;
        renderPage();
        showToast(`המנחה עבר לעמוד ${currentPage + 1}`);
    } else {
        renderPage();
    }
}

// --- Render ---
function renderParticipants(participants) {
    $$('count-number').textContent = participants.length;
    const list = $$('participants-list');
    const gazeboList = $$('gazebo-participants');

    list.innerHTML = '';
    if (gazeboList) gazeboList.innerHTML = '';

    participants.forEach(p => {
        const photoUrl = p.photo || generatePlaceholderPhoto();

        // Header Strip
        const div = document.createElement('div');
        div.className = 'avatar' + (me && p.id === me.id ? ' me' : '');
        const img = document.createElement('img');
        img.src = photoUrl;
        img.alt = 'משתתף';
        div.appendChild(img);
        list.appendChild(div);

        // Gazebo Grid
        if (gazeboList) {
            const gazDiv = document.createElement('div');
            gazDiv.className = 'gazebo-avatar';
            gazDiv.onclick = () => openPhotoZoom(photoUrl);
            const gazImg = document.createElement('img');
            gazImg.src = photoUrl;
            gazDiv.appendChild(gazImg);
            gazeboList.appendChild(gazDiv);
        }
    });
}

function renderPage() {
    const page = HAGGADAH[currentPage];
    if (!page) return;

    const el = $$('page-content');
    const imageUrl = pageImages[currentPage];
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
        imgWrap.onclick = () => triggerPageGeneration(index);

        const overlay = document.createElement('div');
        overlay.className = 'status-overlay hidden';
        overlay.id = `status-overlay-${index}`;
        overlay.innerHTML = `
            <div class="status-text">מייצר תמונה...</div>
            <div class="status-log">לחץ כאן כדי להתחיל</div>
        `;
        imgWrap.appendChild(overlay);

        if (imageUrl) {
            const img = document.createElement('img');
            img.src = imageUrl;
            img.className = 'page-image';
            img.alt = page.title;
            imgWrap.appendChild(img);
        } else {
            const shimmer = document.createElement('div');
            shimmer.className = 'image-shimmer';
            imgWrap.appendChild(shimmer);

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
        } else if (!isSyncingWithLeader || currentPage !== leaderPage) {
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
            // Local move (Free Browsing)
            isSyncingWithLeader = false;
            currentPage = next;
        }

        renderPage();
    }
}

function onSyncWithLeader() {
    isSyncingWithLeader = true;
    if ($$('check-lead-mode')) $$('check-lead-mode').checked = false; // Stop leading if following
    currentPage = leaderPage;
    renderPage();
    showToast('חזרת לסנכרון עם המנחה');
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
        const item = document.createElement('div');
        item.className = 'task-item' + (task.completed ? ' completed' : '');

        item.innerHTML = `
            <div class="task-checkbox" onclick="toggleTask('${task.id}')">
                ${task.completed ? '✓' : ''}
            </div>
            <div class="task-text">
                <span class="task-author">${task.author}:</span>
                ${task.text}
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
    navigator.clipboard.writeText(window.location.href).then(() => {
        showToast('🔗 הקישור הועתק!');
    });
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
