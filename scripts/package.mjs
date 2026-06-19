// Packages the built `dist/` folder into a distributable zip for users who
// don't have the repo. They unzip it and use Chrome's "Load unpacked".
// Run via `npm run package` (which builds first).
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(root, 'dist');

if (!existsSync(distDir)) {
  console.error('dist/ not found — run `npm run build` first.');
  process.exit(1);
}

const { version, name } = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
const slug = (name || 'extension').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const outName = `${slug}-v${version}.zip`;
const outPath = join(root, outName);

rmSync(outPath, { force: true });

try {
  // Zip the CONTENTS of dist/ (manifest.json at the zip root) so the unzipped
  // folder loads directly via "Load unpacked".
  execFileSync('zip', ['-rq', outPath, '.'], { cwd: distDir, stdio: 'inherit' });
} catch (err) {
  console.error('\nFailed to create zip. This script needs the `zip` CLI (available on macOS/Linux).');
  console.error('On Windows, zip the contents of the dist/ folder manually instead.');
  process.exit(1);
}

console.log(`\n✓ Created ${outName} — send this to users; they unzip it and "Load unpacked" in chrome://extensions.`);
