// Builds the header logo and favicons from public/img/logo.jpeg.
const path = require('node:path');
const sharp = require('sharp');

const IMG_DIR = path.join(__dirname, '..', 'public', 'img');
const SOURCE = path.join(IMG_DIR, 'logo.jpeg');
const BACKGROUND = { r: 255, g: 255, b: 255, alpha: 0 };

// The JPEG has an off-white backdrop; turn it into transparency so it blends with any page color.
async function removeBackdrop(input) {
    const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    for (let i = 0; i < data.length; i += 4) {
        const darkest = Math.min(data[i], data[i + 1], data[i + 2]);
        data[i + 3] = Math.max(0, Math.min(255, Math.round((240 - darkest) * 255 / 60)));
    }
    return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

async function main() {
    const cutout = await removeBackdrop(SOURCE);
    const trimmed = await sharp(cutout).trim({ threshold: 10 }).toBuffer({ resolveWithObject: true });
    const { width, height } = trimmed.info;

    await sharp(trimmed.data).resize({ height: 120 }).webp({ quality: 90 }).toFile(path.join(IMG_DIR, 'logo-wordmark.webp'));

    // The chain symbol alone stays legible at favicon sizes; it is the left part of the mark.
    const symbolWidth = Math.round(height * 1.05);
    const symbol = await sharp(trimmed.data)
        .extract({ left: 0, top: 0, width: Math.min(symbolWidth, width), height })
        .trim({ threshold: 10 })
        .toBuffer();

    for (const [name, size] of [['favicon-32.png', 32], ['favicon-192.png', 192], ['apple-touch-icon.png', 180]]) {
        await sharp(symbol)
            .resize(size, size, { fit: 'contain', background: size === 180 ? '#ffffff' : BACKGROUND })
            .png()
            .toFile(path.join(IMG_DIR, name));
    }
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
