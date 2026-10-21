import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

test('stdio handshake, global discovery, resource and synthetic tool result', { timeout: 15000 }, async () => {
  const client = new Client({ name: 'protocol-test', version: '1.0.0' });
  const transport = new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL('../src/server.mjs', import.meta.url))], stderr: 'pipe' });
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    assert.equal(tools.length, 1);
    assert.deepEqual(tools[0]._meta['openai/ui'].entrypoints, [{ type: 'global' }]);
    const uri = tools[0]._meta.ui.resourceUri;
    const { contents } = await client.readResource({ uri });
    assert.equal(contents[0].mimeType, 'text/html;profile=mcp-app');
    assert.match(contents[0].text, /合成示例/);
    assert.ok(!contents[0].text.includes('/* APP_BUNDLE */'));
    const result = await client.callTool({ name: 'open_skill_manager', arguments: {} });
    assert.equal(result.isError, undefined);
    assert.equal(result.structuredContent.mode, 'synthetic');
    assert.equal(result.structuredContent.coverage, null);
    assert.equal(result.structuredContent.skills.length, 2);
    await assert.rejects(client.readResource({ uri: 'file:///private.txt' }));
    const missing = await client.callTool({ name: 'delete_skill', arguments: {} });
    assert.equal(missing.isError, true);
  } finally { await client.close(); }
});
