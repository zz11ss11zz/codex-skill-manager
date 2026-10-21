import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const result = await build({ entryPoints: ['src/app.mjs'], bundle: true, write: false, format: 'iife', platform: 'browser', minify: true });
const template = await readFile('src/dashboard.html', 'utf8');
await mkdir('dist', { recursive: true });
await writeFile('dist/dashboard.html', template.replace('/* APP_BUNDLE */', () => result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')));
