const fs = require('fs');
const html = fs.readFileSync('c:/Users/itais.DESKTOP-0MON2K2/Documents/AntiGravity/signign-circle-main/temp_wikisource.html', 'utf8');
const word = 'רָחְצָה';
const index = html.indexOf(word);
if (index !== -1) {
    console.log(`Word found at index: ${index}`);
    console.log('Snippet:', html.substring(index - 200, index + 500));
} else {
    console.log('Word not found');
}
