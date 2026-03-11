const fs = require('fs');

const fullData = JSON.parse(fs.readFileSync('./haggadah_full.json', 'utf8'));

// Helper to pull deeply nested text
function getText(path) {
    const parts = path.split('.');
    let cur = fullData.text;
    for (const p of parts) {
        if (!cur[p]) return [];
        cur = cur[p];
    }
    return Array.isArray(cur) ? cur : [];
}

const map = {
    'kadesh': ["Kadesh"],
    'urchatz': ["Urchatz"],
    'karpas': ["Karpas"],
    'yachatz': ["Yachatz"],
    'maggid-intro': ["Magid.Ha Lachma Anya"],
    'mah-nishtana': ["Magid.Four Questions"],
    'avadim': ["Magid.We Were Slaves in Egypt"],
    'four-sons': ["Magid.Story of the Five Rabbis", "Magid.The Four Sons", "Magid.Yechol Me'rosh Chodesh", "Magid.In the Beginning Our Fathers Were Idol Worshipers"],
    'ten-plagues': ["Magid.First Fruits Declaration", "Magid.The Ten Plagues"],
    'dayenu': ["Magid.Dayenu"],
    'pesach-matzah-maror': ["Magid.Rabban Gamliel's Three Things"],
    'hallel-part1': ["Magid.First Half of Hallel", "Magid.Second Cup of Wine"],
    'shulchan-orech': ["Rachtzah", "Motzi Matzah", "Maror", "Korech", "Shulchan Orech"],
    'tzafun': ["Tzafun"],
    'barech': ["Barech.Birkat Hamazon", "Barech.Third Cup of Wine"],
    'elijah': ["Barech.Pour Out Thy Wrath"],
    'hallel-song': ["Hallel.Second Half of Hallel", "Hallel.Songs of Praise and Thanks", "Hallel.Fourth Cup of Wine"],
    'nirtzah': ["Nirtzah.Chasal Siddur Pesach", "Nirtzah.L'Shana HaBaa", "Nirtzah.And It Happened at Midnight", "Nirtzah.Zevach Pesach", "Nirtzah.Ki Lo Na'e", "Nirtzah.Adir Hu", "Nirtzah.Sefirat HaOmer", "Nirtzah.Echad Mi Yodea"],
    'chad-gadya': ["Nirtzah.Chad Gadya"]
};

// Existing sections file
const sectionsCode = fs.readFileSync('./backend/src/haggadah/sections.ts', 'utf8');

let updatedCode = sectionsCode;

for (const [id, paths] of Object.entries(map)) {
    let combined = [];
    paths.forEach(p => {
        let lines = getText(p);
        combined = combined.concat(lines);
    });

    // Clean html tags
    const cleanStr = combined.map(l => {
        return l.replace(/<br\s*\/?>/gi, '\\n')
            .replace(/<[^>]+>/g, '')
            .replace(/'/g, "\\'")
            .trim();
    }).filter(x => !!x).join('\\n\\n');

    // Regex replace the hebrew field in the JS code
    // We aim for exactly replacing `hebrew: '...'` inside the block for the given `id: '...'`
    // This regex looks for `id: 'id',` then anything until `hebrew: '...',`
    const regex = new RegExp(`(id:\\s*'${id}'[\\s\\S]*?hebrew:\\s*)'.*?'`, 'g');
    updatedCode = updatedCode.replace(regex, `$1'${cleanStr}'`);
}

fs.writeFileSync('./backend/src/haggadah/sections.ts', updatedCode);
console.log('Successfully injected full Sefaria text into sections.ts!');
