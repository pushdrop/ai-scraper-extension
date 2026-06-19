// Renders the extension icon PNGs from icon/icon.svg at the sizes Chrome needs.
// Run via `npm run icons`; also runs automatically as part of `npm run package`.
//
// Requires the `rsvg-convert` CLI (librsvg). If it's not installed this script
// is a no-op and the committed PNGs in public/icons/ are used as-is, so builds
// and packaging still work everywhere.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svg = join(root, 'icon', 'icon.svg');
const outDir = join(root, 'public', 'icons');
const SIZES = [16, 32, 48, 128];

function has(cmd) {
  try {
    execFileSync('command', ['-v', cmd], { shell: '/bin/sh', stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

if (!has('rsvg-convert')) {
  console.warn('rsvg-convert not found — skipping icon render, using existing PNGs in public/icons/.');
  console.warn('(Install librsvg to regenerate icons from icon/icon.svg.)');
  process.exit(0);
}

if (!existsSync(svg)) {
  console.error(`Source SVG not found: ${svg}`);
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

for (const s of SIZES) {
  execFileSync('rsvg-convert', ['-w', String(s), '-h', String(s), svg, '-o', join(outDir, `icon${s}.png`)]);
}

console.log(`✓ Rendered icons (${SIZES.join(', ')}) from icon/icon.svg into public/icons/`);
