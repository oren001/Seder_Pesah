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
        this.steps = ['welcome', 'guests', 'look', 'avatar', 'selfie', 'exodus-card'];
        
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
        this.safeClick('choice-keep', () => {
            // Keep existing selfie — go straight to join
            this.complete();
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
        this.safeClick('btn-finish-selfie', async () => {
            this.stopRSVPCamera();
            try {
                const r = await fetch('/api/exodus-card-enabled');
                const d = await r.json();
                if (d.enabled) {
                    this.goToStep('exodus-card');
                    this._startExodusCard();
                    return;
                }
            } catch (e) { /* API unreachable — skip exodus card */ }
            this.complete();
        });
        this.safeClick('btn-rsvp-back-selfie', () => {
            this.stopRSVPCamera();
            this.data.photo = null;
            this.goToStep('look');
        });

        // Step Exodus Card
        this.safeClick('btn-exodus-continue', () => this.complete());
        this.safeClick('btn-exodus-share', () => {
            const url = $$('exodus-card-img')?.src;
            if (url) window.open('https://wa.me/?text=' + encodeURIComponent('הנה אני ביציאת מצרים 😂🌊\n' + url), '_blank');
        });
        this.safeClick('btn-exodus-download', () => {
            const url = $$('exodus-card-img')?.src;
            if (!url) return;
            const a = document.createElement('a');
            a.href = url; a.download = 'exodus-' + (this.data.name || 'seder') + '.jpg';
            a.click();
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
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            this._showUploadFallback();
            return;
        }
        navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: 400, height: 400 },
            audio: false
        }).then(stream => {
            video.srcObject = stream;
        }).catch(err => {
            console.error('Camera error:', err);
            this._showUploadFallback();
        });
    }

    _showUploadFallback() {
        $$('rsvp-camera-blocked')?.classList.remove('hidden');
        $$('btn-rsvp-take')?.classList.add('hidden');
        $$('btn-rsvp-upload')?.classList.remove('hidden');
        $$('rsvp-video')?.classList.add('hidden');

        const input = $$('rsvp-upload-input');
        const btn = $$('btn-rsvp-upload');
        if (btn && !btn._wired) {
            btn._wired = true;
            btn.addEventListener('click', () => input.click());
            input.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => {
                    const canvas = $$('rsvp-canvas');
                    const img = new Image();
                    img.onload = () => {
                        canvas.width = 400;
                        canvas.height = 400;
                        const ctx = canvas.getContext('2d');
                        const size = Math.min(img.width, img.height);
                        const sx = (img.width - size) / 2;
                        const sy = (img.height - size) / 2;
                        ctx.drawImage(img, sx, sy, size, size, 0, 0, 400, 400);
                        this.data.photo = canvas.toDataURL('image/jpeg', 0.8);
                        const previewImg = $$('rsvp-preview-img');
                        if (previewImg) {
                            previewImg.src = this.data.photo;
                            $$('rsvp-preview-wrap').classList.remove('hidden');
                            $$('rsvp-post-selfie').classList.remove('hidden');
                            $$('btn-rsvp-upload').classList.add('hidden');
                        }
                    };
                    img.src = ev.target.result;
                };
                reader.readAsDataURL(file);
            });
        }
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
            // If user already has a real selfie, show "keep current photo" option
            const existingSelfie = localStorage.getItem('haggadah_selfie');
            const keepBtn = $$('choice-keep');
            if (keepBtn) {
                if (existingSelfie && (existingSelfie.startsWith('data:') || existingSelfie.startsWith('http'))) {
                    this.data.photo = existingSelfie;
                    keepBtn.classList.remove('hidden');
                } else {
                    keepBtn.classList.add('hidden');
                }
            }
            this.goToStep('look');
        } else {
            this.goToStep('name');
            // Fetch existing participants for name picker
            const roomId = pendingRoomId || currentRoomId;
            if (roomId && socket) {
                socket.emit('peek-room', { roomId }, (res) => {
                    if (res && res.participants && res.participants.length > 0) {
                        this.renderNamePicker(res.participants);
                    }
                });
            }
        }
    }

    renderNamePicker(participants) {
        const pickerWrap = $$('rsvp-name-picker');
        const grid = $$('rsvp-participants-grid');
        if (!pickerWrap || !grid || participants.length === 0) return;

        grid.innerHTML = participants.map(p => {
            const isEmoji = p.photo && !p.photo.startsWith('data:') && !p.photo.startsWith('http');
            // Pending guests (from guest list, not yet joined) show camera icon
            const photoHtml = p.pending
                ? `<div class="rsvp-tile-emoji rsvp-tile-camera">📸</div>`
                : isEmoji
                    ? `<div class="rsvp-tile-emoji">${p.photo}</div>`
                    : p.photo
                        ? `<img src="${p.photo}" class="rsvp-tile-img" onerror="this.style.display='none'">`
                        : `<div class="rsvp-tile-emoji">👤</div>`;
            const pendingClass = p.pending ? ' rsvp-tile-pending' : '';
            return `<div class="rsvp-name-tile${pendingClass}" data-name="${(p.name || '').replace(/"/g, '&quot;')}" data-pending="${p.pending ? '1' : ''}">
                ${photoHtml}
                <span class="rsvp-tile-name">${p.name || 'אורח'}</span>
            </div>`;
        }).join('');

        // Click a tile → fill name input
        // Pending tiles (expected guests) → go directly to selfie (no look step)
        grid.querySelectorAll('.rsvp-name-tile').forEach(tile => {
            tile.addEventListener('click', () => {
                const name = tile.dataset.name;
                const nameInput = $$('rsvp-name-input');
                if (nameInput) { nameInput.value = name; nameInput.focus(); }
                grid.querySelectorAll('.rsvp-name-tile').forEach(t => t.classList.remove('selected'));
                tile.classList.add('selected');

                if (tile.dataset.pending === '1') {
                    // Pre-set guest → straight to selfie
                    this.data.name = name;
                    this.data.type = 'selfie';
                    if (!me || me.isGuest) {
                        me = { name, isGuest: true };
                        localStorage.setItem('haggadah-user', JSON.stringify(me));
                    }
                    this.goToStep('selfie');
                    this.startRSVPCamera();
                }
            });
        });

        pickerWrap.classList.remove('hidden');
    }

    async _startExodusCard() {
        const cachedUrl = localStorage.getItem('haggadah_exodus_card');
        if (cachedUrl) {
            this._showExodusResult(cachedUrl);
            return;
        }

        const tips = [
            'מעלה את הסלפי שלך... 🌊',
            'שולח אותך לים סוף... 🐠',
            'מתפרת לך חלוק מדברי... 👘',
            'אוסף את שש מאות האלף... 🚶',
            'מכין עמוד ענן ועמוד אש... ☁️🔥',
            'עוד רגע אתה יוצא ממצרים!'
        ];
        let tipIdx = 0;
        const tipEl = $$('exodus-loading-tip');
        const tipInterval = setInterval(() => {
            tipIdx = (tipIdx + 1) % tips.length;
            if (tipEl) tipEl.textContent = tips[tipIdx];
        }, 3500);

        try {
            const res = await fetch('/api/generate-exodus-card', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ photo: this.data.photo, name: this.data.name || 'חברי' })
            });

            clearInterval(tipInterval);

            if (res.status === 429) {
                // Already generated — skip straight to seder
                const status = $$('exodus-card-status');
                if (status) status.textContent = 'כבר יצרת תמונה קודם! המשך לסדר 🎨';
                $$('exodus-card-loading')?.classList.add('hidden');
                $$('btn-exodus-continue')?.classList.remove('hidden');
                return;
            }

            const data = await res.json();
            if (data.imageUrl) {
                localStorage.setItem('haggadah_exodus_card', data.imageUrl);
                this._showExodusResult(data.imageUrl);
            } else {
                throw new Error(data.error || 'שגיאה');
            }
        } catch (err) {
            clearInterval(tipInterval);
            console.error('[ExodusCard]', err);
            // Auto-continue to seder on failure — don't leave user stuck
            const status = $$('exodus-card-status');
            if (status) status.textContent = 'ממשיכים לסדר! 🍷';
            $$('exodus-card-loading')?.classList.add('hidden');
            setTimeout(() => this.complete(), 1500);
        }
    }

    _showExodusResult(imageUrl) {
        $$('exodus-card-loading')?.classList.add('hidden');
        $$('exodus-card-status')?.classList.add('hidden');
        const img = $$('exodus-card-img');
        if (img) {
            img.src = imageUrl;
            img.onload = () => $$('exodus-card-result')?.classList.remove('hidden');
        }
        $$('btn-exodus-continue')?.classList.remove('hidden');
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
