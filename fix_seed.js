const fs = require('fs');
const path = require('path');

const serverPath = 'c:/Users/oren weiss/.gemini/antigravity/prod/passover-haggadah/server.js';
let content = fs.readFileSync(serverPath, 'utf8');

// Replace the string-based tasks with object-based tasks in the seed
const sederTasks = `[
                { id: "seder-1", text: "🍷 קדש", author: "סדר", completed: false },
                { id: "seder-2", text: "💧 ורחץ", author: "סדר", completed: false },
                { id: "seder-3", text: "🥬 כרפס", author: "סדר", completed: false },
                { id: "seder-4", text: "🥪 יחץ", author: "סדר", completed: false },
                { id: "seder-5", text: "📖 מגיד", author: "סדר", completed: false },
                { id: "seder-6", text: "🧼 רחצה", author: "סדר", completed: false },
                { id: "seder-7", text: "🥖 מוציא מצה", author: "סדר", completed: false },
                { id: "seder-8", text: "🌿 מרור", author: "סדר", completed: false },
                { id: "seder-9", text: "🌯 כורך", author: "סדר", completed: false },
                { id: "seder-10", text: "🍽️ שולחן עורך", author: "סדר", completed: false },
                { id: "seder-11", text: "🍦 צפון", author: "סדר", completed: false },
                { id: "seder-12", text: "🙏 ברך", author: "סדר", completed: false },
                { id: "seder-13", text: "🎶 הלל", author: "סדר", completed: false },
                { id: "seder-14", text: "✅ נרצה", author: "סדר", completed: false }
            ]`;

// Crude replace but effective for this specific pattern
content = content.replace(/tasks: persistedTasks\[roomId\] \|\| \[\s*"🍷 קדש"(.|\n)*?\]/g, `tasks: persistedTasks[roomId] || \${sederTasks}`);

fs.writeFileSync(serverPath, content);
console.log('Server tasks seeded as objects!');
