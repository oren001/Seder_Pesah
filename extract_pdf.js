const fs = require('fs');
const pdf = require('pdf-parse');

const pdfPath = 'C:\\Users\\oren weiss\\Downloads\\ukEv13158223.pdf';

let dataBuffer = fs.readFileSync(pdfPath);

pdf(dataBuffer).then(function (data) {
    fs.writeFileSync('haggadah_extracted.txt', data.text);
    console.log('Text extracted to haggadah_extracted.txt');
}).catch(err => {
    console.error('Error parsing PDF:', err);
});
