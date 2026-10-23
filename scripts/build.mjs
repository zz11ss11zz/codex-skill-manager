import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { publishDashboard } from '../src/dashboard-resource.mjs';
import { appIcon } from '../src/app-icon.mjs';
const { version } = JSON.parse(await readFile('package.json', 'utf8'));
if (!/^[0-9A-Za-z.+-]+$/.test(version)) throw new Error('Invalid package version');
const result = await build({ entryPoints: ['src/app.mjs'], bundle: true, write: false, format: 'iife', platform: 'browser', minify: true });
const template = (await readFile('src/dashboard.html', 'utf8')).replace('<!-- APP_VERSION -->', `v${version}`).replace('</head>', `<link rel="icon" type="image/png" href="${appIcon.src}"></head>`);
await publishDashboard(template.replace('/* APP_BUNDLE */', () => result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')));
