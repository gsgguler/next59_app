import sharp from 'sharp';
import fs from 'fs';

const svgBuffer = fs.readFileSync('public/favicon.svg');
const sizes = [16, 32, 48, 96, 144, 180, 192, 256, 384, 512];

async function generate() {
  for (const size of sizes) {
    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(`public/favicon-${size}.png`);
    console.log(`Generated favicon-${size}.png`);
  }
  // Multi-size .ico (16x16 + 32x32)
  await sharp(svgBuffer)
    .resize(32, 32)
    .png()
    .toFile('public/favicon.ico');
  console.log('Generated favicon.ico');
}

generate().catch(console.error);
