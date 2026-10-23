import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

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
    assert.deepEqual((await readdir(root)).sort(), ['README.md', 'THIRD_PARTY_NOTICES.txt', 'assets', 'mcp.json', 'plugin.json', 'server']);
    assert.ok((await readFile(path.join(root, manifest.extensions['com.openai'].interface.composerIcon))).length > 0);
    const config = JSON.parse(await readFile(path.join(root, 'mcp.json'))).mcpServers[pkg.name];
    assert.equal(config.command, 'node');
    assert.equal(config.type, 'stdio');
    const substitute = value => value.replaceAll('${PLUGIN_ROOT}', root);
    transport = new StdioClientTransport({ command: process.execPath, args: config.args.map(substitute), cwd: substitute(config.cwd), stderr: 'pipe' });
    await client.connect(transport);
    assert.equal(client.getServerVersion().version, pkg.version);
    const { tools } = await client.listTools();
    assert.equal(tools.length, 11);
    const uri = tools[0]._meta.ui.resourceUri;
    const { contents } = await client.readResource({ uri });
    assert.match(contents[0].text, /id="activity-panel"/);
    assert.ok(contents[0].text.includes(pkg.version));
    const revision = uri.match(/dashboard-([a-f0-9]+)\.html/)[1];
    assert.equal(await readFile(path.join(root, `server/dist/revisions/${revision}.html`), 'utf8'), contents[0].text);
    const bundle = await readFile(path.join(root, 'server/src/server.mjs'), 'utf8');
    assert.ok(!bundle.includes(source));
    assert.match(await readFile(path.join(root, 'THIRD_PARTY_NOTICES.txt'), 'utf8'), /@modelcontextprotocol\/sdk/);
  } finally {
    await client.close();
    if (transport) await transport.close();
    await rm(temporary, { recursive: true, force: true });
  }
});
