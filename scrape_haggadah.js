const https = require('https');
const fs = require('fs');

const url = 'https://he.wikisource.org/wiki/%D7%A1%D7%99%D7%93%D7%95%D7%A8/%D7%A0%D7%95%D7%A1%D7%97_%D7%90%D7%A9%D7%9B%D7%A0%D7%96/%D7%A4%D7%A1%D7%97/%D7%94%D7%92%D7%93%D7%94';

const options = {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
};

https.get(url, options, (res) => {
    let html = '';
    res.on('data', chunk => html += chunk);
    res.on('end', () => {
        fs.writeFileSync('temp_wikisource.html', html);
        console.log('HTML saved to temp_wikisource.html');
    });
}).on('error', (e) => {
    console.error('Error fetching wikisource:', e);
});
