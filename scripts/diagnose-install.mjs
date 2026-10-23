// Isolated local marketplace probes; no real profile or plugin settings are changed.
import { mkdtemp, mkdir, readFile, writeFile, cp, rename, readdir } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);
if (!process.argv[2]) throw new Error('Usage: node scripts/diagnose-install.mjs <built-plugin-directory>');
const source = path.resolve(process.argv[2]);
const sourceFiles = await readdir(source);
const notices = sourceFiles.includes('THIRD_PARTY_NOTICES.md') ? 'THIRD_PARTY_NOTICES.md' : 'THIRD_PARTY_NOTICES.txt';
await mkdir('work', { recursive: true });
const root = await mkdtemp(path.resolve('work/install-matrix-'));
const market = path.join(root, 'market');
const home = path.join(root, 'profile', '.codex');
await mkdir(path.join(market, '.agents/plugins'), { recursive: true });
await mkdir(home, { recursive: true });
const env = { ...process.env, CODEX_HOME: home, USERPROFILE: path.dirname(home), HOME: path.dirname(home) };
const variants = [
  ['minimal', []], ['manifest', []], ['icon', ['assets']], ['mcp', ['mcp.json']],
  ['readme', ['README.md']], ['migration', ['DATA_MIGRATION.md']], ['notices', [notices]],
  ['bundle', ['server/src/server.mjs']], ['html', []],
  ['tiny-text', []], ['large-text', []], ['empty-dir', []],
  ['full', ['assets', 'mcp.json', 'server', ...(sourceFiles.includes('skills') ? ['skills'] : []), 'README.md', 'DATA_MIGRATION.md', notices]],
];
const plugins = [];
for (const [variant, files] of variants) {
  const name = `probe-${variant}`, dest = path.join(market, 'plugins', name);
  await mkdir(dest, { recursive: true });
  const manifest = variant === 'minimal' ? { name, version: '0.1.0', description: 'Isolated install probe' } : { ...JSON.parse(await readFile(path.join(source, 'plugin.json'))), name };
  await writeFile(path.join(dest, 'plugin.json'), JSON.stringify(manifest));
  for (const file of files) { await mkdir(path.dirname(path.join(dest, file)), { recursive: true }); await cp(path.join(source, file), path.join(dest, file), { recursive: true }); }
  if (variant === 'tiny-text') await writeFile(path.join(dest, 'README.md'), 'Test fixture.\n');
  if (variant === 'large-text') await writeFile(path.join(dest, 'sample.txt'), 'Synthetic test fixture.\n'.repeat(100000));
  if (variant === 'html') await writeFile(path.join(dest, 'dashboard.html'), '<p>Synthetic test fixture.</p>\n'.repeat(100000));
  if (variant === 'empty-dir') await mkdir(path.join(dest, 'server/src'), { recursive: true });
  plugins.push({ name, source: { source: 'local', path: `./plugins/${name}` }, policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' }, category: 'Productivity' });
}
await writeFile(path.join(market, '.agents/plugins/marketplace.json'), JSON.stringify({ name: 'install-matrix', plugins }));
const cli = args => run(process.env.CODEX_SKILL_MANAGER_CLI || 'codex', args, { cwd: root, env, windowsHide: true, timeout: 45000, maxBuffer: 1024 * 1024 });
console.log(`PROBE_ROOT ${root}`);
await cli(['plugin', 'marketplace', 'add', market, '--json']);
const results = [];
for (const { name } of plugins) {
  try { const r = await cli(['plugin', 'add', `${name}@install-matrix`, '--json']); results.push({ name, passed: true, stdout: r.stdout }); }
  catch (error) { results.push({ name, passed: false, stderr: error.stderr, stdout: error.stdout }); }
  console.log(JSON.stringify(results.at(-1)));
  await writeFile(path.join(root, 'result.json'), JSON.stringify(results, null, 2));
}
// Separate OS-level evidence: use copies owned by this run, never repair the CLI cache.
const renames = [];
for (const name of [notices, 'server/src/server.mjs']) {
  const stage = path.join(root, `rename-${path.basename(name)}`);
  await mkdir(stage);
  await cp(path.join(source, name), path.join(stage, path.basename(name)));
  const start = Date.now(), errors = [];
  let passed = false;
  for (let attempt = 0; attempt < 20; attempt++) {
    try { await rename(stage, `${stage}-done`); passed = true; break; }
    catch (error) {
      errors.push(error.code);
      if (!['EPERM', 'EACCES', 'EBUSY'].includes(error.code)) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  renames.push({ name, passed, delayMs: Date.now() - start, errors });
}
await writeFile(path.join(root, 'rename-results.json'), JSON.stringify(renames, null, 2));
console.log(JSON.stringify({ renames }));
