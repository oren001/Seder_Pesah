const fs = require('fs');
const https = require('https');

const indexData = JSON.parse(fs.readFileSync('haggadah_index.json', 'utf8'));

const extractRefs = (node) => {
    let refs = [];
    if (node.nodes && node.nodes.length > 0) {
        node.nodes.forEach(child => {
            refs = refs.concat(extractRefs(child));
        });
    } else if (node.key) {
        let keyStr = String(node.key).replace(/ /g, '_');
        refs.push(`Pesach_Haggadah,_${keyStr}`);
    }
    return refs;
};

const refsToFetch = extractRefs(indexData.schema);
console.log('Fetching', refsToFetch.length, 'sections...');

const fetchRef = (ref) => {
    return new Promise((resolve) => {
        const url = `https://www.sefaria.org/api/texts/${encodeURI(ref)}?context=0&commentary=0`;
        https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
            let raw = '';
            res.on('data', c => raw += c);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(raw));
                } catch (e) { resolve(null); }
            });
        }).on('error', () => resolve(null));
    });
};

async function run() {
    let fullHaggadah = [];
    for (const ref of refsToFetch) {
        process.stdout.write(`Fetching ${ref}... `);
        const data = await fetchRef(ref);
        if (data && data.he) {
            let rawHe = data.he;
            if (typeof rawHe === 'string') rawHe = [rawHe];

            const flatten = (arr) => arr.reduce((acc, val) => Array.isArray(val) ? acc.concat(flatten(val)) : acc.concat(val), []);
            const heText = flatten(rawHe).filter(t => typeof t === 'string' && t.trim().length > 0);

            if (heText.length > 0) {
                fullHaggadah.push({
                    ref: ref,
                    heTitle: data.heRef || ref,
                    text: heText.map(t => t.replace(/<[^>]*>?/g, '')),
                });
                console.log(`OK (${heText.length} lines)`);
            } else {
                console.log('Skipped (Empty text)');
            }
        } else {
            console.log('Failed or no HE data');
        }
        await new Promise(r => setTimeout(r, 100));
    }

    fs.writeFileSync('full_haggadah_text.json', JSON.stringify(fullHaggadah, null, 2));
    console.log(`Done! Wrote ${fullHaggadah.length} valid sections to full_haggadah_text.json`);
}

run();
