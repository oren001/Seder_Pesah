const https = require('https');
const fs = require('fs');

https.get('https://www.sefaria.org/api/v3/texts/Passover_Haggadah?version=hebrew&return_format=default', {
    headers: { 'User-Agent': 'Mozilla/5.0' }
}, (res) => {
    let raw = '';
    res.setEncoding('utf8');
    res.on('data', c => raw += c);
    res.on('end', () => {
        fs.writeFileSync('haggadah_v3.json', raw);
        console.log('Saved v3 API response to haggadah_v3.json');
    });
}).on('error', (e) => {
    console.error('Got error: ' + e.message);
});
