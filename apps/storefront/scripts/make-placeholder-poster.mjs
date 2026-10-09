// Renders the synthetic hero poster (an abstract road at dusk) to
// src/assets/poster-placeholder.jpg. Placeholder only: the real poster is a
// client shoot (docs/motion-spec.md section 6). Run: node scripts/make-placeholder-poster.mjs
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const W = 1600;
const H = 900;
const HORIZON = 520;

const dashes = Array.from({ length: 9 }, (_, i) => {
  // Perspective: dashes grow and spread as they approach the viewer.
  const t0 = (i / 9) ** 1.8;
  const t1 = ((i + 0.45) / 9) ** 1.8;
  const y0 = HORIZON + t0 * (H - HORIZON);
  const y1 = HORIZON + t1 * (H - HORIZON);
  const w0 = 1 + t0 * 14;
  const w1 = 1 + t1 * 14;
  return `<polygon points="${800 - w0 / 2},${y0} ${800 + w0 / 2},${y0} ${800 + w1 / 2},${y1} ${800 - w1 / 2},${y1}" fill="#E8E2D0" opacity="${0.25 + t0 * 0.45}"/>`;
}).join('');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#121722"/>
      <stop offset="0.55" stop-color="#2B2735"/>
      <stop offset="0.85" stop-color="#6B3B2E"/>
      <stop offset="1" stop-color="#C2672A"/>
    </linearGradient>
    <radialGradient id="sun" cx="0.62" cy="1" r="0.5">
      <stop offset="0" stop-color="#F2A13A" stop-opacity="0.85"/>
      <stop offset="1" stop-color="#F2A13A" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="road" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2A2A30"/>
      <stop offset="1" stop-color="#14171E"/>
    </linearGradient>
    <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7"/><feColorMatrix values="0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0.05 0"/></filter>
  </defs>
  <rect width="${W}" height="${HORIZON}" fill="url(#sky)"/>
  <rect y="${HORIZON - 260}" width="${W}" height="260" fill="url(#sun)"/>
  <path d="M0 ${HORIZON} L0 470 Q160 430 320 462 T640 455 T980 448 T1300 466 T1600 450 L1600 ${HORIZON} Z" fill="#1A1820"/>
  <rect y="${HORIZON}" width="${W}" height="${H - HORIZON}" fill="#0F1218"/>
  <polygon points="790,${HORIZON} 810,${HORIZON} 1420,${H} 180,${H}" fill="url(#road)"/>
  <polygon points="790,${HORIZON} 793,${HORIZON} 236,${H} 214,${H}" fill="#E8E2D0" opacity="0.35"/>
  <polygon points="807,${HORIZON} 810,${HORIZON} 1386,${H} 1364,${H}" fill="#E8E2D0" opacity="0.35"/>
  ${dashes}
  <rect width="${W}" height="${H}" filter="url(#grain)"/>
  <text x="${W - 32}" y="${H - 28}" text-anchor="end" font-family="Arial, sans-serif" font-size="22" fill="#FFFFFF" opacity="0.45">placeholder poster</text>
</svg>`;

const out = new URL('../src/assets/poster-placeholder.jpg', import.meta.url);
await sharp(Buffer.from(svg)).jpeg({ quality: 82, mozjpeg: true }).toFile(fileURLToPath(out));
console.log('wrote src/assets/poster-placeholder.jpg');
