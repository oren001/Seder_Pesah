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
        this.setupEventListeners();
        this.renderAvatars();
    }

    setupEventListeners() {
        // Step Welcome
        $$('btn-rsvp-share').onclick = () => {
            const url = window.location.origin + '?room=' + currentRoomId;
            navigator.clipboard.writeText(url).then(() => {
                showToast('הקישור הועתק! 📝 שלחו אותו בווטסאפ');
            });
        };
        $$('btn-rsvp-next-1').onclick = () => {
            if (window.me) {
                this.goToStep('guests');
            } else {
                this.goToStep('name');
            }
        };

        // Step Name
        $$('btn-rsvp-next-name').onclick = () => {
            const name = $$('rsvp-guest-name').value.trim();
            if (name) {
                this.data.name = name;
                this.goToStep('guests');
            } else {
                showToast('בבקשה הכניסו שם');
            }
        };

        // Step Guests
        document.querySelectorAll('.guest-btn').forEach(btn => {
            btn.onclick = () => {
                document.querySelectorAll('.guest-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                this.data.guestCount = parseInt(btn.dataset.count);
                $$('btn-rsvp-next-2').disabled = false;
            };
        });
        $$('btn-rsvp-next-2').onclick = () => this.goToStep('look');

        // Step Look
        $$('choice-selfie').onclick = () => {
            this.data.type = 'selfie';
            this.goToStep('selfie');
            this.startRSVPCamera();
        };
        $$('choice-avatar').onclick = () => {
            this.data.type = 'avatar';
            this.goToStep('avatar');
        };

        // Step Avatar
        $$('btn-finish-avatar').onclick = () => this.complete();

        // Step Selfie
        $$('btn-rsvp-take').onclick = () => this.takeRSVPSelfie();
        $$('btn-rsvp-retake').onclick = () => this.retakeRSVPSelfie();
        $$('btn-finish-selfie').onclick = () => this.complete();
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
        canvas.width = 200;
        canvas.height = 200;
        const ctx = canvas.getContext('2d');
        
        // Mirror fix
        ctx.translate(200, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, 200, 200);
        
        this.data.photo = canvas.toDataURL('image/jpeg', 0.6);
        $$('rsvp-preview-img').src = this.data.photo;
        $$('rsvp-preview-wrap').classList.remove('hidden');
        $$('rsvp-video').classList.add('hidden');
        $$('btn-rsvp-take').classList.add('hidden');
        $$('rsvp-post-selfie').classList.remove('hidden');
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
        this.goToStep(isEliteEdit ? 'guests' : 'welcome');
    }

    complete() {
        this.stopRSVPCamera();
        this.goToStep('finish');
        $$('btn-go-to-haggadah').onclick = () => {
            if (this.callbacks.onComplete) {
                this.callbacks.onComplete(this.data);
            }
        };
    }
}
