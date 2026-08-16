import fs from "node:fs";
import { PNG } from "pngjs";

const file = process.argv[2];
if (!file) {
  console.error("usage: node scripts/analyze.mjs <png> [cols]");
  process.exit(1);
}
const cols = Number(process.argv[3] || 96);

const png = PNG.sync.read(fs.readFileSync(file));
const { width, height, data } = png;
const rows = Math.max(12, Math.round((cols * height) / width / 2.1));

// statistik
let sumR = 0, sumG = 0, sumB = 0, bright = 0, red = 0, white = 0;
const N = width * height;
for (let i = 0; i < N; i++) {
  const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
  sumR += r; sumG += g; sumB += b;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  if (lum > 180) bright++;
  if (r > 120 && r > g * 1.8 && r > b * 1.8) red++;
  if (r > 200 && g > 200 && b > 200) white++;
}
console.log(
  `\n${file}  ${width}x${height}  meanRGB: (${(sumR / N).toFixed(0)}, ${(sumG / N).toFixed(
    0
  )}, ${(sumB / N).toFixed(0)})  bright: ${((bright / N) * 100).toFixed(1)}%  red: ${(
    (red / N) * 100
  ).toFixed(2)}%  white: ${((white / N) * 100).toFixed(1)}%\n`
);

// ASCII art (luminance)
const chars = " .:-=+*#%@";
const out = [];
for (let y = 0; y < rows; y++) {
  let line = "";
  for (let x = 0; x < cols; x++) {
    const px = Math.min(width - 1, Math.floor(((x + 0.5) / cols) * width));
    const py = Math.min(height - 1, Math.floor(((y + 0.5) / rows) * height));
    const i = (py * width + px) * 4;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    // beri penekanan pada merah
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const isRed = r > 110 && r > g * 1.7 && r > b * 1.7;
    const isWhite = lum > 190 && r > 190 && g > 190 && b > 190;
    const idx = Math.min(chars.length - 1, Math.floor((lum / 255) * (chars.length - 1)));
    line += isRed ? "R" : isWhite ? "W" : chars[idx];
  }
  out.push(line);
}
console.log(out.join("\n"));
