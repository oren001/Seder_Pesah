const fs = require('fs');
const path = require('path');

const dataPath = 'c:/Users/oren weiss/.gemini/antigravity/prod/passover-haggadah/public/haggadah_data.js';
let content = fs.readFileSync(dataPath, 'utf8');

// The file starts with "const HAGGADAH = "
const dataJson = content.replace('const HAGGADAH = ', '').replace(/;\s*$/, '');
const haggadah = JSON.parse(dataJson);

function cleanTransliteration(text) {
    if (!text) return '';
    // Remove all non-ASCII characters (this will strip Hebrew letters, nekudot, and symbols like אֱ)
    // We keep spaces, common punctuation, and letters.
    return text.replace(/[^\x00-\x7F]/g, '').trim();
}

haggadah.forEach(page => {
    if (page.segments) {
        page.segments.forEach(seg => {
            if (seg.en) {
                seg.en = cleanTransliteration(seg.en);
                // Simple extra fixes for common issues
                seg.en = seg.en.replace(/\s+/g, ' ');
            }
        });
    }
});

const output = 'const HAGGADAH = ' + JSON.stringify(haggadah, null, 2) + ';';
fs.writeFileSync(dataPath, output);
console.log('Transliteration cleaned!');
