const https = require('https');
const fs = require('fs');

async function fetchSefaria(ref, lang) {
    return new Promise((resolve, reject) => {
        https.get(`https://www.sefaria.org/api/v3/texts/${ref}?version=${lang}&return_format=default`, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        }, (res) => {
            let raw = '';
            res.setEncoding('utf8');
            res.on('data', c => raw += c);
            res.on('end', () => resolve(JSON.parse(raw)));
        }).on('error', reject);
    });
}

async function run() {
    try {
        console.log('Fetching Hebrew...');
        const he = await fetchSefaria('Passover_Haggadah', 'hebrew');
        console.log('Fetching English...');
        const en = await fetchSefaria('Passover_Haggadah', 'english');

        const combined = { he, en };
        fs.writeFileSync('haggadah_sefaria_combined.json', JSON.stringify(combined, null, 2));
        console.log('Saved combined Sefaria data to haggadah_sefaria_combined.json');
    } catch (e) {
        console.error('Error:', e);
    }
}

run();
