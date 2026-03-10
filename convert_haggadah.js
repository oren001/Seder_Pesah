const fs = require('fs');

const full = JSON.parse(fs.readFileSync('haggadah_full.json', 'utf8'));
const sections = full.text;
const output = [];

function processSegments(segments) {
    if (!segments) return [];
    if (!Array.isArray(segments)) {
        // If it's a string, wrap it. If it's an object (nested), flatten it.
        if (typeof segments === 'string') return [{ he: segments.replace(/<[^>]*>?/gm, '').trim(), en: '' }];
        if (typeof segments === 'object') {
            let list = [];
            for (const key in segments) {
                list = list.concat(processSegments(segments[key]));
            }
            return list;
        }
        return [];
    }
    return segments.map(s => ({
        he: s.replace(/<[^>]*>?/gm, '').trim(),
        en: ''
    })).filter(s => s.he.length > 0);
}

for (const key in sections) {
    const segments = processSegments(sections[key]);
    if (segments.length > 0) {
        output.push({
            title: key,
            segments: segments
        });
    }
}

fs.writeFileSync('public/haggadah_data.js', 'const HAGGADAH = ' + JSON.stringify(output, null, 2) + ';');
console.log('Successfully converted Sefaria data to public/haggadah_data.js');
