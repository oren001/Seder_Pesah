const fs = require('fs');
const html = fs.readFileSync('c:/Users/itais.DESKTOP-0MON2K2/Documents/AntiGravity/signign-circle-main/temp_wikisource.html', 'utf8');

const sMatch = html.match(/<s[ >]/);
const strikeMatch = html.match(/<strike[ >]/);
const delMatch = html.match(/<del[ >]/);
const lineThroughMatch = html.match(/text-decoration:\s*line-through/);

console.log('Results:');
console.log('<s> found:', !!sMatch);
console.log('<strike> found:', !!strikeMatch);
console.log('<del> found:', !!delMatch);
console.log('line-through style found:', !!lineThroughMatch);

if (sMatch) {
    const idx = html.indexOf(sMatch[0]);
    console.log('Snippet <s>:', html.substring(idx - 100, idx + 200));
}
if (strikeMatch) {
    const idx = html.indexOf(strikeMatch[0]);
    console.log('Snippet <strike>:', html.substring(idx - 100, idx + 200));
}
