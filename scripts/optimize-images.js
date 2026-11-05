// Generates responsive WebP variants in public/assets/products from source-images/.
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const SOURCE_DIR = path.join(__dirname, '..', 'source-images');
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'assets', 'products');
const WIDTHS = [120, 400, 800];

async function main() {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    const files = fs.readdirSync(SOURCE_DIR).filter(file => /\.(jpe?g|png)$/i.test(file));

    for (const file of files) {
        const slug = path.parse(file).name;
        for (const width of WIDTHS) {
            const output = path.join(OUTPUT_DIR, `${slug}-${width}.webp`);
            await sharp(path.join(SOURCE_DIR, file))
                .rotate()
                .resize(width, width, { fit: 'cover', position: sharp.strategy.attention })
                .webp({ quality: 78 })
                .toFile(output);
        }
        console.log(`Optimized ${slug}`);
    }
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
