import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { scanInventory } from '../src/inventory.mjs';

test('standalone package builds and serves MCP resources outside the source tree', { timeout: 30000 }, async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'skill-plugin-'));
  const root = path.join(temporary, 'plugin with spaces');
  const source = fileURLToPath(new URL('..', import.meta.url));
  const client = new Client({ name: 'package-test', version: '1' });
  let transport;
  try {
    execFileSync(process.execPath, ['scripts/build-plugin.mjs', root], { cwd: source });
    const pkg = JSON.parse(await readFile(path.join(source, 'package.json')));
    const manifest = JSON.parse(await readFile(path.join(root, 'plugin.json')));
    assert.equal(manifest.version, pkg.version);
    assert.equal(manifest.name, pkg.name);
    assert.deepEqual((await readdir(root)).sort(), ['DATA_MIGRATION.md', 'README.md', 'THIRD_PARTY_NOTICES.md', 'assets', 'mcp.json', 'plugin.json', 'server', 'skills']);
    const inventory = await scanInventory({ skills: path.join(root, 'skills'), agentSkills: path.join(temporary, 'absent-agent-skills'), cache: path.join(temporary, 'absent-cache') });
    assert.equal(inventory.skills.length, 1);
    assert.equal(inventory.skills[0].name, 'skill-manager');
    assert.ok((await readFile(path.join(root, manifest.extensions['com.openai'].interface.composerIcon))).length > 0);
    const config = JSON.parse(await readFile(path.join(root, 'mcp.json'))).mcpServers[pkg.name];
    assert.equal(config.command, 'node');
    assert.equal(config.type, 'stdio');
    const substitute = value => value.replaceAll('${PLUGIN_ROOT}', root);
    transport = new StdioClientTransport({ command: process.execPath, args: config.args.map(substitute), cwd: substitute(config.cwd), stderr: 'pipe', env: { CODEX_SKILL_MANAGER_DATA_DIR: path.join(temporary, 'persistent data') } });
    await client.connect(transport);
    assert.equal(client.getServerVersion().version, pkg.version);
    const { tools } = await client.listTools();
    assert.equal(tools.length, 11);
    const uri = tools[0]._meta.ui.resourceUri;
    const { contents } = await client.readResource({ uri });
    assert.match(contents[0].text, /id="activity-panel"/);
    assert.ok(contents[0].text.includes(pkg.version));
    assert.ok(contents[0].text.includes(`版本 / Version v${pkg.version}</span>`));
    assert.equal(await readFile(path.join(source, 'dist/dashboard.html'), 'utf8'), contents[0].text);
    assert.ok(!(await readdir(path.join(root, 'server'))).includes('dist'));
    await assert.rejects(client.readResource({ uri: 'ui://codex-skill-manager/dashboard-0000000000000000.html' }));
    const bundle = await readFile(path.join(root, 'server/src/server.mjs'), 'utf8');
    assert.ok(!bundle.includes(source));
    assert.match(await readFile(path.join(root, 'THIRD_PARTY_NOTICES.md'), 'utf8'), /@modelcontextprotocol\/sdk/);
    const call = { id: 'packaged_restart_call_001', plugin: 'demo', tool: 'mcp__codex_apps__demo_read' };
    assert.ok(!(await client.callTool({ name: 'record_plugin_calls', arguments: { calls: [call] } })).isError);
    await client.close(); await transport.close();
    const restarted = new Client({ name: 'restart-test', version: '1' });
    transport = new StdioClientTransport({ command: process.execPath, args: config.args.map(substitute), cwd: substitute(config.cwd), stderr: 'pipe', env: { CODEX_SKILL_MANAGER_DATA_DIR: path.join(temporary, 'persistent data') } });
    try {
      await restarted.connect(transport);
      assert.ok(!(await restarted.callTool({ name: 'record_plugin_calls', arguments: { calls: [call] } })).isError);
      const records = JSON.parse(await readFile(path.join(temporary, 'persistent data', 'plugin-calls.json')));
      assert.equal(records.calls.length, 1);
      assert.equal(records.calls[0].id, call.id);
      assert.ok(!(await readdir(path.join(root, 'server'))).includes('.local'));
    } finally { await restarted.close(); }
  } finally {
    await client.close();
    if (transport) await transport.close();
    await rm(temporary, { recursive: true, force: true });
  }
});
