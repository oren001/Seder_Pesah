const fs = require('fs');
const path = require('path');

const indexPath = 'c:/Users/oren weiss/.gemini/antigravity/prod/passover-haggadah/public/index.html';
let content = fs.readFileSync(indexPath, 'utf8');

const newLobbyAuth = `
            <div id="lobby-auth-section" class="auth-section">
                <div class="auth-instruction" style="margin-bottom: 1.5rem; opacity: 0.8;">התחבר כדי להתחיל את הסדר:
                </div>
                <div id="g_id_onload" data-client_id="1046467069134-placeholder.apps.googleusercontent.com"
                    data-callback="handleGoogleResponse" data-auto_prompt="false">
                </div>
                <!-- Google Button (Troubled) -->
                <div class="g_id_signin" data-type="standard" data-shape="pill" data-theme="filled_blue"
                    data-text="signin_with" data-size="large" data-logo_alignment="left"></div>
                
                <div class="guest-fallback" style="margin-top: 2rem; background: rgba(255,255,255,0.05); padding: 1.5rem; border-radius: 15px; border: 1px solid rgba(255,255,255,0.1);">
                    <p style="margin-bottom: 1rem; font-weight: 800;">אפשרות מומלצת (ללא גוגל):</p>
                    <input type="text" id="guest-name" placeholder="הכנס את שמך כאן..." class="input-field" style="margin-bottom: 1rem; width: 90%; text-align: center; border: 2px solid var(--gold);">
                    <button id="btn-guest-login" class="btn primary">המשך כאורח 🧞‍♂️✨</button>
                    <p class="tiny-text" style="margin-top: 1rem; opacity: 0.6;">אם גוגל עושה בעיות - כנס כאורח!</p>
                </div>

                <div style="margin-top: 2rem;">
                    <button id="btn-sign-out-global" class="btn tiny" style="opacity: 0.5; background: none; border: 1px solid rgba(255,255,255,0.2);">התנתק / נקה הגדרות 🚪</button>
                </div>
            </div>

            <div id="lobby-actions-section" class="lobby-actions hidden">
                <button id="btn-create-room" class="btn primary large">צור חדר חדש ← 🍷</button>
                <div style="margin-top: 1.5rem;">
                    <button id="btn-sign-out" class="btn tiny" style="opacity: 0.6; background: none; border: 1px solid rgba(255,255,255,0.2);">התנתק 🚪</button>
                </div>
            </div>`;

// Replace the entire block from <div id="lobby-auth-section" ... to the end of <div id="lobby-actions-section" ...
content = content.replace(/<div id="lobby-auth-section"(.|\n)*?<\/div>\s*<\/div>/, newLobbyAuth);

fs.writeFileSync(indexPath, content);
console.log('Index.html lobby updated!');
