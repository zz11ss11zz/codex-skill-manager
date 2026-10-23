import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

test('marketplace artifact resolves to a complete portable package and companion skill', { timeout: 30000 }, async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'manager-market-'));
  const root = path.join(tmp, 'market with spaces');
  const source = fileURLToPath(new URL('..', import.meta.url));
  try {
    execFileSync(process.execPath, ['scripts/build-marketplace.mjs', root], { cwd: source });
    const catalog = JSON.parse(await readFile(path.join(root, '.agents/plugins/marketplace.json')));
    assert.equal(catalog.plugins.length, 1);
    const entry = catalog.plugins[0];
    assert.equal(entry.source.source, 'local');
    assert.ok(entry.source.path.startsWith('./'));
    const plugin = path.resolve(root, entry.source.path);
    assert.ok(plugin.startsWith(root + path.sep));
    const manifest = JSON.parse(await readFile(path.join(plugin, 'plugin.json')));
    assert.equal(manifest.name, entry.name);
    assert.equal(entry.policy.installation, 'AVAILABLE');
    const mcp = JSON.parse(await readFile(path.join(plugin, 'mcp.json')));
    const server = mcp.mcpServers[entry.name];
    assert.ok((await stat(server.args[0].replaceAll('${PLUGIN_ROOT}', plugin))).isFile());
    const skills = await readdir(path.join(plugin, 'skills'));
    assert.deepEqual(skills, ['skill-manager']);
    const text = await readFile(path.join(plugin, 'skills/skill-manager/SKILL.md'), 'utf8');
    const metadata = parse(text.split('---')[1]);
    assert.equal(metadata.name, skills[0]);
    assert.equal(typeof metadata.description, 'string');
    // A second build must refuse an existing directory and preserve its contents.
    assert.throws(() => execFileSync(process.execPath, ['scripts/build-marketplace.mjs', root], { cwd: source, stdio: 'pipe' }));
    assert.equal(JSON.parse(await readFile(path.join(plugin, 'plugin.json'))).version, manifest.version);
  } finally { await rm(tmp, { recursive: true, force: true }); }
});
