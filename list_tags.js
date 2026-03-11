const fs = require('fs');
const html = fs.readFileSync('c:/Users/itais.DESKTOP-0MON2K2/Documents/AntiGravity/signign-circle-main/temp_wikisource.html', 'utf8');

const tags = new Set();
const tagRegex = /<([a-z0-9]+)/gi;
let match;
while ((match = tagRegex.exec(html)) !== null) {
    tags.add(match[1].toLowerCase());
}

const classes = new Set();
const classRegex = /class="([^"]+)"/gi;
while ((match = classRegex.exec(html)) !== null) {
    match[1].split(/\s+/).forEach(c => classes.add(c));
}

console.log('Tags found:', Array.from(tags).join(', '));
console.log('Interesting classes:', Array.from(classes).filter(c => c.toLowerCase().includes('strike') || c.toLowerCase().includes('del') || c.toLowerCase().includes('line')));
