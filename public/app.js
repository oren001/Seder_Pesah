// --- State ---
let socket;
let pendingRoomId = null;
let selfieDataUrl = null;
let me = null;
let currentRoomId = null;
let currentPage = 0;
const pageImages = {};  // { [pageIndex]: imageUrl } — grows as AI generates images

// --- DOM refs ---
const $$ = id => document.getElementById(id);

const screens = {
    lobby: $$('lobby-screen'),
    selfie: $$('selfie-screen'),
    room: $$('room-screen')
};

// --- Init ---
async function init() {
    socket = io();

    // Add event listeners
    $$('btn-create-room').addEventListener('click', onCreateRoom);
    $$('btn-take-selfie').addEventListener('click', onTakeSelfie);
    $$('btn-retake').addEventListener('click', onRetake);
    $$('btn-join-with-photo').addEventListener('click', onJoinWithPhoto);
    $$('btn-copy-link').addEventListener('click', onCopyLink);
    $$('btn-prev').addEventListener('click', () => changePage(-1));
    $$('btn-next').addEventListener('click', () => changePage(1));

    // Socket listeners
    socket.on('room-updated', onRoomUpdated);
    socket.on('page-changed', onPageChanged);
    socket.on('image-ready', ({ pageIndex, imageUrl }) => {
        pageImages[pageIndex] = imageUrl;
        if (pageIndex === currentPage) renderPage();
    });

    // Check if arriving via invite link
    const params = new URLSearchParams(window.location.search);
    const inviteRoomId = params.get('room');
    if (inviteRoomId) {
        pendingRoomId = inviteRoomId;
        showScreen('selfie');
        await startCamera();
    } else {
        showScreen('lobby');
    }
}

// --- Camera ---
async function startCamera() {
    const video = $$('selfie-video');
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: 400, height: 400, facingMode: 'user' },
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

    $$('selfie-preview-img').src = selfieDataUrl;
    $$('selfie-preview-wrap').classList.remove('hidden');
    $$('btn-take-selfie').classList.add('hidden');
    $$('selfie-video').style.display = 'none';
}

function onRetake() {
    selfieDataUrl = null;
    $$('selfie-preview-wrap').classList.add('hidden');
    $$('btn-take-selfie').classList.remove('hidden');
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
            currentPage = response.currentPage;
            if (response.images) Object.assign(pageImages, response.images);

            $$('total-pages').textContent = HAGGADAH.length;
            updateUrlParam('room', currentRoomId);
            showScreen('room');
            renderPage();
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
    currentPage = newPage;
    renderPage();
    showToast(`העמוד שונה ל-${currentPage + 1}`);
}

// --- Render ---
function renderParticipants(participants) {
    $$('count-number').textContent = participants.length;
    const list = $$('participants-list');
    list.innerHTML = '';
    participants.forEach(p => {
        const div = document.createElement('div');
        div.className = 'avatar' + (me && p.id === me.id ? ' me' : '');
        const img = document.createElement('img');
        img.src = p.photo || generatePlaceholderPhoto();
        img.alt = 'משתתף';
        div.appendChild(img);
        list.appendChild(div);
    });
}

function renderPage() {
    const page = HAGGADAH[currentPage];
    if (!page) return;

    const el = $$('page-content');
    const imageUrl = pageImages[currentPage];

    el.style.opacity = '0';
    setTimeout(() => {
        const imgHtml = imageUrl
            ? `<div class="page-image-wrap"><img class="page-image" src="${imageUrl}" loading="lazy"/></div>`
            : `<div class="image-shimmer" title="תמונה ביצירה..."></div>`;

        el.innerHTML = `
            <div class="page-title">${page.title}</div>
            ${imgHtml}
            <div class="page-text">${page.text}</div>
        `;

        $$('current-page-num').textContent = currentPage + 1;
        $$('btn-prev').disabled = currentPage === 0;
        $$('btn-next').disabled = currentPage === HAGGADAH.length - 1;
        el.style.opacity = '1';
    }, 180);
}

function changePage(delta) {
    const next = currentPage + delta;
    if (next >= 0 && next < HAGGADAH.length) {
        currentPage = next;
        socket.emit('change-page', { roomId: currentRoomId, pageIndex: next });
        renderPage();
    }
}

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
