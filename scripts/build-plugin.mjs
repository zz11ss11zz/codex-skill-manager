import { build } from 'esbuild';
import { mkdir, readFile, writeFile, copyFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

// A fresh directory avoids retaining private state from an earlier test run.
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const root = path.resolve(process.argv[2] || path.join('dist', `plugin-${pkg.version}`));
await mkdir(root); // Fail closed if the destination already exists.
for (const dir of ['assets', 'server/src/assets', 'server/dist/revisions']) await mkdir(path.join(root, dir), { recursive: true });
const bundle = await build({
  entryPoints: ['src/server.mjs'], outfile: path.join(root, 'server/src/server.mjs'),
  bundle: true, platform: 'node', target: 'node20', format: 'esm', metafile: true,
  banner: { js: "import { createRequire as bundleCreateRequire } from 'node:module'; const require = bundleCreateRequire(import.meta.url);" },
});
const manifest = {
  $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
  name: pkg.name, version: pkg.version, description: 'Local skill inventory and adoption records for Codex.',
  extensions: { 'com.openai': { interface: { displayName: 'Codex Skill Manager', shortDescription: 'Local skill inventory and adoption records', composerIcon: './assets/icon.png' } } },
};
const mcp = { mcpServers: { 'codex-skill-manager': { type: 'stdio', command: 'node', args: ['${PLUGIN_ROOT}/server/src/server.mjs'], cwd: '${PLUGIN_ROOT}' } } };
for (const [name, data] of [['plugin.json', manifest], ['mcp.json', mcp]]) await writeFile(path.join(root, name), JSON.stringify(data, null, 2) + '\n');
for (const dest of ['assets/icon.png', 'server/src/assets/orbit-planet.png']) await copyFile('src/assets/orbit-planet.png', path.join(root, dest));
const html = await readFile('dist/dashboard.html');
const revision = createHash('sha256').update(html).digest('hex').slice(0, 16);
await writeFile(path.join(root, 'server/dist/dashboard.html'), html);
await writeFile(path.join(root, `server/dist/revisions/${revision}.html`), html);
const dependencies = new Set(Object.keys(bundle.metafile.inputs).flatMap(file => {
  const match = file.replaceAll('\\', '/').match(/^(.*node_modules\/(?:@[^/]+\/)?[^/]+)\//);
  return match ? [match[1]] : [];
}));
const notices = [];
for (const dependency of [...dependencies].sort()) {
  const info = JSON.parse(await readFile(path.join(dependency, 'package.json'), 'utf8'));
  const files = (await readdir(dependency)).filter(name => /^(license|notice|copying)(\.|$)/i.test(name));
  if (!files.length) throw new Error(`Missing license notice: ${info.name}`);
  notices.push(`${info.name}@${info.version}\n${(await Promise.all(files.map(file => readFile(path.join(dependency, file), 'utf8')))).join('\n')}`);
}
await writeFile(path.join(root, 'THIRD_PARTY_NOTICES.txt'), notices.join('\n\n---\n\n'));
await copyFile('docs/PLUGIN_TESTING.md', path.join(root, 'README.md'));
console.log(`Built ${root}`);
