import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { publishDashboard } from '../src/dashboard-resource.mjs';
import { appIcon } from '../src/app-icon.mjs';
const result = await build({ entryPoints: ['src/app.mjs'], bundle: true, write: false, format: 'iife', platform: 'browser', minify: true });
const template = (await readFile('src/dashboard.html', 'utf8')).replace('</head>', `<link rel="icon" type="image/png" href="${appIcon.src}"></head>`);
await publishDashboard(template.replace('/* APP_BUNDLE */', () => result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')));
