import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { publishDashboard } from '../src/dashboard-resource.mjs';
const result = await build({ entryPoints: ['src/app.mjs'], bundle: true, write: false, format: 'iife', platform: 'browser', minify: true });
const template = await readFile('src/dashboard.html', 'utf8');
await publishDashboard(template.replace('/* APP_BUNDLE */', () => result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')));
