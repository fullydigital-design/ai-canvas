import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const buildDir = join(__dirname, '..', 'build');

if (!existsSync(buildDir)) mkdirSync(buildDir, { recursive: true });

// Generate a professional AI Canvas Editor icon using SVG
const SIZE = 512;
const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1a1a2e"/>
      <stop offset="100%" style="stop-color:#16213e"/>
    </linearGradient>
    <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#3ECF8E"/>
      <stop offset="100%" style="stop-color:#2BA86A"/>
    </linearGradient>
    <linearGradient id="glow" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#3ECF8E;stop-opacity:0.3"/>
      <stop offset="100%" style="stop-color:#3ECF8E;stop-opacity:0"/>
    </linearGradient>
  </defs>
  
  <!-- Rounded square background -->
  <rect x="16" y="16" width="480" height="480" rx="96" ry="96" fill="url(#bg)"/>
  <rect x="16" y="16" width="480" height="480" rx="96" ry="96" fill="none" stroke="#3ECF8E" stroke-width="3" opacity="0.4"/>
  
  <!-- Canvas/artboard shape -->
  <rect x="120" y="100" width="272" height="220" rx="12" fill="#232340" stroke="#3ECF8E" stroke-width="2.5" opacity="0.9"/>
  
  <!-- Checkerboard pattern inside canvas (transparency indicator) -->
  <g opacity="0.15">
    <rect x="120" y="100" width="34" height="27.5" fill="#fff"/>
    <rect x="188" y="100" width="34" height="27.5" fill="#fff"/>
    <rect x="256" y="100" width="34" height="27.5" fill="#fff"/>
    <rect x="324" y="100" width="34" height="27.5" fill="#fff"/>
    <rect x="154" y="127.5" width="34" height="27.5" fill="#fff"/>
    <rect x="222" y="127.5" width="34" height="27.5" fill="#fff"/>
    <rect x="290" y="127.5" width="34" height="27.5" fill="#fff"/>
    <rect x="358" y="127.5" width="34" height="27.5" fill="#fff"/>
  </g>
  
  <!-- Mountain/landscape inside canvas -->
  <polygon points="120,320 200,220 260,270 340,180 392,320" fill="#2BA86A" opacity="0.5"/>
  <polygon points="160,320 240,250 320,320" fill="#3ECF8E" opacity="0.4"/>
  
  <!-- Sun in canvas -->
  <circle cx="340" cy="150" r="24" fill="#3ECF8E" opacity="0.6"/>
  
  <!-- AI sparkle/wand element -->
  <g transform="translate(320, 340)">
    <!-- Wand stick -->
    <line x1="0" y1="0" x2="80" y2="80" stroke="#3ECF8E" stroke-width="6" stroke-linecap="round"/>
    <line x1="0" y1="0" x2="80" y2="80" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity="0.4"/>
    
    <!-- Sparkles around wand tip -->
    <g transform="translate(-10, -10)">
      <!-- Main sparkle -->
      <path d="M0,-18 L4,-4 L18,0 L4,4 L0,18 L-4,4 L-18,0 L-4,-4 Z" fill="#3ECF8E"/>
      <!-- Small sparkles -->
      <path d="M-25,-8 L-22,-4 L-18,-8 L-22,-12 Z" fill="#3ECF8E" opacity="0.6"/>
      <path d="M12,-25 L14,-20 L18,-25 L14,-30 Z" fill="#3ECF8E" opacity="0.5"/>
      <path d="M-15,15 L-12,18 L-9,15 L-12,12 Z" fill="#3ECF8E" opacity="0.4"/>
    </g>
  </g>
  
  <!-- Layer stack indicator (bottom-left) -->
  <g transform="translate(80, 360)">
    <rect x="0" y="20" width="50" height="35" rx="4" fill="#232340" stroke="#3ECF8E" stroke-width="1.5" opacity="0.5"/>
    <rect x="8" y="12" width="50" height="35" rx="4" fill="#232340" stroke="#3ECF8E" stroke-width="1.5" opacity="0.7"/>
    <rect x="16" y="4" width="50" height="35" rx="4" fill="#232340" stroke="#3ECF8E" stroke-width="2"/>
  </g>
  
  <!-- "AI" text badge -->
  <rect x="340" y="86" width="52" height="26" rx="6" fill="#3ECF8E"/>
  <text x="366" y="104" font-family="Inter, Arial, sans-serif" font-size="16" font-weight="700" fill="#1a1a2e" text-anchor="middle">AI</text>
</svg>
`;

async function generate() {
  console.log('Generating icon...');
  
  // Generate PNGs at multiple sizes
  const sizes = [16, 24, 32, 48, 64, 128, 256, 512];
  const pngBuffers = [];
  
  for (const size of sizes) {
    const buf = await sharp(Buffer.from(svg))
      .resize(size, size)
      .png()
      .toBuffer();
    pngBuffers.push(buf);
    writeFileSync(join(buildDir, `icon-${size}.png`), buf);
    console.log(`  Created icon-${size}.png`);
  }
  
  // Save the 512px version as the main PNG
  writeFileSync(join(buildDir, 'icon.png'), pngBuffers[pngBuffers.length - 1]);
  console.log('  Created icon.png (512x512)');
  
  // Convert 256px PNG to ICO (ICO works best with 256px)
  const icoBuffer = await pngToIco([
    join(buildDir, 'icon-16.png'),
    join(buildDir, 'icon-24.png'),
    join(buildDir, 'icon-32.png'),
    join(buildDir, 'icon-48.png'),
    join(buildDir, 'icon-64.png'),
    join(buildDir, 'icon-128.png'),
    join(buildDir, 'icon-256.png'),
  ]);
  writeFileSync(join(buildDir, 'icon.ico'), icoBuffer);
  console.log('  Created icon.ico (multi-resolution)');
  
  console.log('\nDone! Icon files in build/');
}

generate().catch(console.error);
