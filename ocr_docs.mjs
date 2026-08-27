import Tesseract from 'tesseract.js';
import fs from 'fs';

async function scan() {
    for (let i = 1; i <= 7; i++) {
        const file = `api_pages/page_${i}.png`;
        if (fs.existsSync(file)) {
            console.log(`Scanning ${file}...`);
            const { data: { text } } = await Tesseract.recognize(file, 'eng');
            console.log(`--- ${file} ---`);
            console.log(text.substring(0, 1000));
            fs.writeFileSync(`api_pages/page_${i}.txt`, text);
        }
    }
}
scan();
