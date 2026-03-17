/**
 * RSVPFlow.js
 * Multi-step onboarding and profile management
 */

const AVATARS = ['🍷', '🥨', '🐸', '🐪', '🌊', '📜', '🥯', '🍗', '🌿', '🏺', '✨', '🤴'];

class RSVPFlow {
    constructor(callbacks) {
        this.callbacks = callbacks; // { onComplete: (data) => {} }
        this.data = {
            guestCount: 1,
            photo: null,
            type: 'selfie' // 'selfie' or 'avatar'
        };
        
        this.currentStep = 0;
        this.steps = ['welcome', 'guests', 'look', 'avatar', 'selfie'];
        
        this.init();
    }

    init() {
        this.renderAvatars();
        this.setupEventListeners();
    }

    safeClick(id, fn) {
        const el = $$(id);
        if (el) el.onclick = fn;
    }

    setupEventListeners() {
        // Step Name
        this.safeClick('btn-rsvp-name-next', () => {
            const nameInput = $$('rsvp-name-input');
            const name = nameInput ? nameInput.value.trim() : '';
            if (!name) {
                if (nameInput) nameInput.focus();
                showToast('נא להזין שם 😊');
                return;
            }
            this.data.name = name;
            // Save as guest user
            if (!me || me.isGuest) {
                me = { name, isGuest: true };
                localStorage.setItem('haggadah-user', JSON.stringify(me));
            }
            this.goToStep('look');   // ← show selfie vs skip choice
        });

        // Allow Enter key on name input
        const nameInput = $$('rsvp-name-input');
        if (nameInput) {
            nameInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') $$('btn-rsvp-name-next')?.click();
            });
        }

        // Step Welcome (legacy)
        this.safeClick('btn-rsvp-share', () => {
            const url = window.location.origin + '?room=' + currentRoomId;
            navigator.clipboard.writeText(url).then(() => {
                showToast('הקישור הועתק! 📝 שלחו אותו בווטסאפ');
            });
        });

        this.safeClick('btn-rsvp-next-1', () => {
            this.goToStep('look');
        });

        // Steps Guests removed from JS flow logic

        // Step Look
        this.safeClick('choice-selfie', () => {
            this.data.type = 'selfie';
            this.goToStep('selfie');
            this.startRSVPCamera();
        });
        this.safeClick('choice-avatar', () => {
            // "Skip" — assign a random Passover emoji and join immediately
            this.data.type = 'avatar';
            this.data.photo = AVATARS[Math.floor(Math.random() * AVATARS.length)];
            this.complete();
        });

        // Step Avatar
        this.safeClick('btn-finish-avatar', () => this.complete());
        this.safeClick('btn-rsvp-back-avatar', () => this.goToStep('look'));

        // Step Selfie
        this.safeClick('btn-rsvp-take', () => this.takeRSVPSelfie());
        this.safeClick('btn-rsvp-retake', () => this.retakeRSVPSelfie());
        this.safeClick('btn-finish-selfie', () => this.complete());
        this.safeClick('btn-rsvp-back-selfie', () => {
            this.stopRSVPCamera();
            this.data.photo = null;
            this.goToStep('look');
        });
    }

    renderAvatars() {
        const grid = $$('avatar-grid');
        grid.innerHTML = AVATARS.map(icon => `
            <div class="avatar-item" data-icon="${icon}">${icon}</div>
        `).join('');

        grid.querySelectorAll('.avatar-item').forEach(item => {
            item.onclick = () => {
                grid.querySelectorAll('.avatar-item').forEach(i => i.classList.remove('selected'));
                item.classList.add('selected');
                this.data.photo = item.dataset.icon;
            };
        });
    }

    goToStep(stepId) {
        document.querySelectorAll('.rsvp-step').forEach(s => s.classList.add('hidden'));
        $$('rsvp-step-' + stepId).classList.remove('hidden');
    }

    startRSVPCamera() {
        const video = $$('rsvp-video');
        navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: 'user', width: 400, height: 400 }, 
            audio: false 
        }).then(stream => {
            video.srcObject = stream;
        }).catch(err => {
            console.error('Camera error:', err);
            showToast('לא ניתן להפעיל מצלמה');
        });
    }

    takeRSVPSelfie() {
        const video = $$('rsvp-video');
        const canvas = $$('rsvp-canvas');
        canvas.width = 400;
        canvas.height = 400;
        const ctx = canvas.getContext('2d');
        
        // Calculate dimensions for center cropping
        const videoW = video.videoWidth;
        const videoH = video.videoHeight;
        const size = Math.min(videoW, videoH);
        const sourceX = (videoW - size) / 2;
        const sourceY = (videoH - size) / 2;

        // Mirror and draw square crop
        ctx.translate(400, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, sourceX, sourceY, size, size, 0, 0, 400, 400);
        
        this.data.photo = canvas.toDataURL('image/jpeg', 0.8);
        const previewImg = $$('rsvp-preview-img');
        if (previewImg) {
            previewImg.src = this.data.photo;
            $$('rsvp-preview-wrap').classList.remove('hidden');
            $$('rsvp-video').classList.add('hidden');
            $$('btn-rsvp-take').classList.add('hidden');
            $$('rsvp-post-selfie').classList.remove('hidden');
        }
    }

    retakeRSVPSelfie() {
        $$('rsvp-preview-wrap').classList.add('hidden');
        $$('rsvp-video').classList.remove('hidden');
        $$('btn-rsvp-take').classList.remove('hidden');
        $$('rsvp-post-selfie').classList.add('hidden');
        this.data.photo = null;
    }

    stopRSVPCamera() {
        const video = $$('rsvp-video');
        if (video.srcObject) {
            video.srcObject.getTracks().forEach(t => t.stop());
            video.srcObject = null;
        }
    }

    show(isEliteEdit = false) {
        showScreen('rsvp');
        this.data.type = 'selfie';
        if (me && me.name) {
            this.data.name = me.name;
            const nameInput = $$('rsvp-name-input');
            if (nameInput) nameInput.value = me.name;
            // Always show the selfie-vs-skip choice (never auto-open camera)
            this.goToStep('look');
        } else {
            this.goToStep('name');
        }
    }

    complete() {
        this.stopRSVPCamera();
        if (this.data.photo) {
            localStorage.setItem('haggadah_selfie', this.data.photo);
        }
        // Join room immediately (background) — onComplete will call showFinish()
        if (this.callbacks.onComplete) {
            this.callbacks.onComplete(this.data);
        }
    }

    showFinish(participants) {
        this.goToStep('finish');

        // Show user's own photo
        const finishPhotoWrap = $$('rsvp-finish-photo');
        if (finishPhotoWrap) {
            finishPhotoWrap.innerHTML = '';
            if (this.data.photo) {
                const isEmoji = !this.data.photo.startsWith('data:') && !this.data.photo.startsWith('http');
                if (isEmoji) {
                    finishPhotoWrap.innerHTML = `<div class="emoji-avatar" style="font-size:4rem;line-height:1">${this.data.photo}</div>`;
                } else {
                    finishPhotoWrap.innerHTML = `<img src="${this.data.photo}" style="width:110px;height:110px;border-radius:50%;object-fit:cover;border:3px solid var(--gold);">`;
                }
            }
        }

        // Participant gallery (others only)
        const grid = $$('finish-participants-grid');
        const section = $$('finish-participants-section');
        const others = (participants || []).filter(p => p.photo !== this.data.photo);
        if (grid && others.length > 0) {
            section.classList.remove('hidden');
            const show = others.slice(0, 6);
            grid.innerHTML = show.map(p => {
                const isEmoji = p.photo && !p.photo.startsWith('data:') && !p.photo.startsWith('http');
                const photoHtml = isEmoji
                    ? `<div class="fp-emoji">${p.photo}</div>`
                    : `<img src="${p.photo || ''}" class="fp-img" onerror="this.style.display='none'">`;
                return `<div class="fp-wrap">${photoHtml}<div class="fp-name">${p.name || 'אורח'}</div></div>`;
            }).join('');
            if (others.length > 6) {
                grid.innerHTML += `<div class="fp-wrap"><div class="fp-more">+${others.length - 6}</div></div>`;
            }
        }
    }
}
