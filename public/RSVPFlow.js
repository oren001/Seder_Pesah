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
        // Step Welcome
        this.safeClick('btn-rsvp-share', () => {
            const url = window.location.origin + '?room=' + currentRoomId;
            navigator.clipboard.writeText(url).then(() => {
                showToast('הקישור הועתק! 📝 שלחו אותו בווטסאפ');
            });
        });

        this.safeClick('btn-rsvp-next-1', () => {
            this.goToStep('look');
        });

        // Steps Name and Guests removed from JS flow logic

        // Step Look
        this.safeClick('choice-selfie', () => {
            this.data.type = 'selfie';
            this.goToStep('selfie');
            this.startRSVPCamera();
        });
        this.safeClick('choice-avatar', () => {
            this.data.type = 'avatar';
            this.goToStep('avatar');
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
        // Skip name and guests - go straight to 'look' (Selfie vs Avatar)
        this.goToStep('look');
    }

    complete() {
        this.stopRSVPCamera();
        if (this.data.photo) {
            localStorage.setItem('haggadah_selfie', this.data.photo);
        }
        this.goToStep('finish');
        $$('btn-go-to-haggadah').onclick = () => {
            if (this.callbacks.onComplete) {
                this.callbacks.onComplete(this.data);
            }
        };
    }
}
