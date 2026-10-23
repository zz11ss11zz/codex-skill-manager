import { mkdir, copyFile, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const root = path.resolve(process.argv[2] || `dist/marketplace-${pkg.version}`);
await mkdir(root); // Never overwrite a previous artifact or its test data.
await mkdir(path.join(root, '.agents/plugins'), { recursive: true });
await mkdir(path.join(root, 'plugins'));
execFileSync(process.execPath, ['scripts/build-plugin.mjs', path.join(root, 'plugins', pkg.name)], { stdio: 'inherit' });
await copyFile('packaging/marketplace.json', path.join(root, '.agents/plugins/marketplace.json'));
await copyFile('docs/MARKETPLACE.md', path.join(root, 'README.md'));
await copyFile('docs/MARKETPLACE.zh-CN.md', path.join(root, 'README.zh-CN.md'));
console.log(`Built marketplace ${root}`);
