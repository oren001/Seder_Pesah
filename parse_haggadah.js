const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, 'temp_wikisource.html');
const outputPath = path.join(__dirname, 'public', 'haggadah_data.js');

if (!fs.existsSync(htmlPath)) {
    console.error('File not found: temp_wikisource.html');
    process.exit(1);
}

const html = fs.readFileSync(htmlPath, 'utf8');

// Find the start of the content div
const contentStartMatch = html.match(/<div[^>]*class="[^"]*mw-parser-output[^"]*"[^>]*>/);
if (!contentStartMatch) {
    console.error('Could not find mw-parser-output div');
    process.exit(1);
}

const contentStart = html.indexOf(contentStartMatch[0]) + contentStartMatch[0].length;
// Wikisource usually ends with a NewPP report or just the end of the div. 
// We'll find the last </div> before the footer or limit report.
const contentEnd = html.indexOf('<!-- \nNewPP limit report', contentStart) || html.lastIndexOf('</div>');

const content = html.substring(contentStart, contentEnd);

const results = [];
let currentSection = { title: "Introduction", segments: [] };
const sims = ["קַדֵּשׁ", "וּרְחַץ", "כַּרְפַּס", "יַחַץ", "מַגִּיד", "רָחְצָה", "מוֹצִיא", "מַצָּה", "מָרוֹר", "כּוֹרֵךְ", "שֻׁלְחָן עוֹרֵךְ", "צָפוּן", "בָּרֵךְ", "הַלֵּל", "נִרְצָה"];

// Split by tags: headers <h2>/<h3>, paragraphs <p>, or center-aligned divs
// We use a more granular split to keep structure
const fragments = content.split(/(<h[23][^>]*>.*?<\/h[23]>|<p[^>]*>.*?<\/p>|<div[^>]*>.*?<\/div>)/is);

fragments.forEach(frag => {
    if (!frag || !frag.trim()) return;

    // Remove all HTML tags to check if it's a heading
    const plainText = frag.replace(/<[^>]*>?/g, '').trim();
    const isHeading = frag.toLowerCase().startsWith('<h') || sims.some(sim => plainText === sim);

    if (isHeading && plainText && plainText.length < 100) {
        if (currentSection.segments.length > 0) {
            results.push(currentSection);
        }
        currentSection = { title: plainText, segments: [] };
    } else {
        // Clean fragment: keep <b>, <s>, <i>, <br>
        let clean = frag.replace(/<(?!b|\/b|s|\/s|i|\/i|br|\/br)[^>]+>/gi, '');
        clean = clean.trim();
        if (clean) {
            currentSection.segments.push({ he: clean, en: "" });
        }
    }
});

// Add the last section
if (currentSection.segments.length > 0) {
    results.push(currentSection);
}

const jsContent = `const HAGGADAH = ${JSON.stringify(results, null, 2)};\n\nif (typeof module !== 'undefined') module.exports = HAGGADAH;`;
fs.writeFileSync(outputPath, jsContent);
console.log(`Successfully updated ${outputPath} with ${results.length} sections.`);
