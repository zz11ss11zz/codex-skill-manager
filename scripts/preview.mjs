// Explicit development harness. Every backend operation is confined to synthetic temp files.
import { createServer as createHttpServer } from 'node:http';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../src/server.mjs';
import { ArchiveManager } from '../src/archive.mjs';
import { UsageIndex } from '../src/usage-index.mjs';
import { SkillNotes } from '../src/skill-notes.mjs';

const temporary = await mkdtemp(path.join(os.tmpdir(), 'skill-manager-ui-'));
const roots = { skills: path.join(temporary, 'skills'), cache: path.join(temporary, 'cache') };
const file = async (relative, content) => { const target = path.join(temporary, relative); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, content); };
const markdown = (name, description) => `---\nname: ${name}\ndescription: ${description}\n---\nSynthetic fixture only.\n`;
await file('skills/chart-demo/SKILL.md', markdown('chart-demo', '合成示例：图表绘制与数据展示'));
await file('skills/report-demo/SKILL.md', markdown('report-demo', '合成示例：报告整理'));
await file('skills/.system/system-demo/SKILL.md', markdown('system-demo', '合成系统技能，不可归档'));
await file('cache/test-market/plugin-demo/1/.codex-plugin/plugin.json', JSON.stringify({ name: 'plugin-demo', skills: './skills' }));
await file('cache/test-market/plugin-demo/1/skills/chart-demo/SKILL.md', markdown('chart-demo', '合成示例：图表绘制与数据展示'));
await file('logs/demo.jsonl', JSON.stringify({ type: 'response_item', timestamp: '2026-01-01T00:00:00Z', payload: { type: 'message', id: 'demo-message', role: 'user', content: [{ type: 'input_text', text: '$report-demo' }] } }) + '\n');
const service = createServer(roots, {
  skillNotes: new SkillNotes(path.join(temporary, 'notes.json')),
  archiveManager: new ArchiveManager({ roots, archiveRoot: path.join(temporary, 'archive') }),
  usageIndex: new UsageIndex({ roots: [path.join(temporary, 'logs')], stateFile: path.join(temporary, 'index', 'usage.json') }),
  queryPlugins: async () => ({ checkedAt: new Date().toISOString(), evidence: 'synthetic CLI result', plugins: [{ id: 'plugin-demo@test-market', version: '1', enabled: true }] }),
});
const client = new Client({ name: 'synthetic-ui-client', version: '1.0.0' });
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
await service.connect(serverTransport); await client.connect(clientTransport);
const allowedTools = new Set((await client.listTools()).tools.map(t => t.name));
const script = await build({ entryPoints: [fileURLToPath(new URL('./preview-host.mjs', import.meta.url))], bundle: true, write: false, format: 'esm', platform: 'browser' });
const dashboard = await readFile(new URL('../dist/dashboard.html', import.meta.url));
const page = '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>能力管理器 · 合成数据验证</title><style>body{font-family:system-ui;margin:0;background:#e9edf2}header{padding:12px}iframe{display:block;border:1px solid #adb7c2;max-width:100%;width:960px;height:calc(100vh - 85px);margin:auto;background:white}button{padding:8px;margin-right:8px}</style><header><strong>合成数据验证 · 不读取或修改你的技能</strong> <button id="narrow">窄面板</button><button id="wide">宽面板</button><span id="host-status"></span></header><iframe id="app" title="能力管理器测试面板"></iframe><script type="module" src="/bridge.js"></script></html>';
let origin;
const http = createHttpServer(async (request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  try {
    if (request.method === 'GET' && request.url === '/') { response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end(page); }
    else if (request.method === 'GET' && request.url === '/dashboard') { response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end(dashboard); }
    else if (request.method === 'GET' && request.url === '/bridge.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(script.outputFiles[0].text); }
    else if (request.method === 'POST' && request.url === '/tool' && request.headers.origin === origin && request.headers['content-type'] === 'application/json') {
      let body = '';
      for await (const chunk of request) { body += chunk; if (body.length > 65536) { response.writeHead(413).end(); return; } }
      const params = JSON.parse(body);
      if (!allowedTools.has(params.name)) { response.writeHead(400).end(); return; }
      response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(await client.callTool(params)));
    } else response.writeHead(404).end();
  } catch { response.writeHead(500).end('Synthetic harness error'); }
});
await new Promise(resolve => http.listen(0, '127.0.0.1', resolve));
origin = `http://127.0.0.1:${http.address().port}`;
console.log(origin);
let closing = false;
async function stop() { if (closing) return; closing = true; http.closeAllConnections(); await new Promise(resolve => http.close(resolve)); await client.close(); await service.close(); await rm(temporary, { recursive: true, force: true }); }
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { stop().then(() => process.exit(0)); });

process.stdin.resume();
process.stdin.on('data', data => { if (data.toString().trim() === 'q') stop().then(() => process.exit(0)); });
