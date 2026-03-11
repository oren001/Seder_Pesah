const https = require('https');

https.get('https://api.github.com/search/code?q=filename:haggadah.json+language:json', {
    headers: { 'User-Agent': 'Node-Fetch' }
}, (res) => {
    let raw = '';
    res.on('data', c => raw += c);
    res.on('end', () => {
        try {
            const data = JSON.parse(raw);
            const items = data.items || [];
            items.slice(0, 3).forEach(item => {
                const rawUrl = item.html_url.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/');
                console.log(rawUrl);
            });
        } catch (e) { console.error('Error', e); }
    });
});
