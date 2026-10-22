import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { publishDashboard, registerDashboard } from '../src/dashboard-resource.mjs';

test('existing and new sessions read each other’s immutable UI builds after an upgrade', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'manager-ui-revisions-'));
  const file = path.join(dir, 'dashboard.html'), connections = [];
  const connect = async () => {
    const server = new McpServer({ name: 'test-ui-server', version: '1' });
    const uri = registerDashboard(server, file);
    const client = new Client({ name: 'test-ui-client', version: '1' });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await server.connect(b); await client.connect(a);
    connections.push({ server, client }); return { client, uri };
  };
  try {
    const aHtml = '<!doctype html><p>Version A</p>', bHtml = '<!doctype html><p>Version B</p>';
    // Upgrade from an existing build that predates the revision archive.
    await writeFile(file, aHtml);
    const a = await connect();
    await publishDashboard(bHtml, file);
    const b = await connect();
    assert.notEqual(a.uri, b.uri);
    for (const {client} of [a, b]) {
      for (const [uri, html] of [[a.uri, aHtml], [b.uri, bHtml]]) {
        const result = await client.readResource({uri});
        assert.equal(result.contents[0].uri, uri);
        assert.equal(result.contents[0].text, html);
      }
    }
    assert.equal(await readFile(file, 'utf8'), bHtml);
    await assert.rejects(a.client.readResource({uri:'ui://codex-skill-manager/dashboard-..%2Foutside.html'}));
    await assert.rejects(a.client.readResource({uri:'ui://codex-skill-manager/dashboard-0000000000000000.html'}));
    const bRevision = b.uri.match(/dashboard-(.+)\.html/)[1];
    await writeFile(path.join(dir, 'revisions', `${bRevision}.html`), 'corrupted');
    await assert.rejects(a.client.readResource({uri:b.uri}), /content mismatch/);
    assert.equal((await a.client.readResource({uri:a.uri})).contents[0].text, aHtml);
  } finally {
    for (const {client, server} of connections) { await client.close(); await server.close(); }
    await rm(dir, {recursive:true,force:true});
  }
});
