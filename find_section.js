const fs = require('fs');
const html = fs.readFileSync('c:/Users/itais.DESKTOP-0MON2K2/Documents/AntiGravity/signign-circle-main/temp_wikisource.html', 'utf8');
const word = 'id="רָחְצָה"';
const index = html.indexOf(word);
if (index !== -1) {
    console.log(`Heading found at index: ${index}`);
    console.log('Snippet:', html.substring(index - 200, index + 800));
} else {
    console.log('Heading not found');
}
