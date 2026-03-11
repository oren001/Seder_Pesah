const https = require('https');

const options = {
    hostname: 'api.github.com',
    path: '/search/code?q=haggadah+language:json',
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
};

https.get(options, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        try {
            const parsed = JSON.parse(data);
            if (parsed.items) {
                parsed.items.slice(0, 10).forEach(item => {
                    console.log(`repo: ${item.repository.full_name}, path: ${item.path}`);
                    console.log(`url: https://raw.githubusercontent.com/${item.repository.full_name}/master/${item.path}`);
                });
            } else {
                console.log(parsed);
            }
        } catch (e) { console.error(e); }
    });
}).on('error', e => console.error(e));
