// UI check against the real packaged stdio service and an isolated acceptance fixture.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const report = JSON.parse(await readFile(process.argv[2], 'utf8'));
if (report.data !== 'synthetic isolated fixture') throw new Error('Only synthetic acceptance fixtures may be served');
const env = { ...process.env, CODEX_HOME: report.codexHome, USERPROFILE: report.profile, HOME: report.profile, CODEX_SKILL_MANAGER_DATA_DIR: report.persistent };
delete env.CODEX_SKILL_MANAGER_LEGACY_DIR;
const client = new Client({ name: 'acceptance-browser-host', version: '1' });
const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(report.cached, 'server', 'src', 'server.mjs')], env, stderr: 'pipe' });
await client.connect(transport);
const tools = (await client.listTools()).tools;
const resource = await client.readResource({ uri: tools.find(t => t.name === 'open_skill_manager')._meta.ui.resourceUri });
const bridge = await build({ entryPoints: ['scripts/preview-host.mjs'], bundle: true, write: false, format: 'esm', platform: 'browser' });
const page = '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>M2 独立包验收</title><style>body{font-family:system-ui;margin:0;background:#edf1f5}header{padding:12px;font-size:13px}iframe{display:block;border:1px solid #dce2ea;max-width:100%;width:960px;height:calc(100vh - 70px);margin:auto;background:white}button{padding:5px;margin-left:8px}</style><header><strong>M2 独立包 · 隔离测试记录 · 浏览器验收</strong><button id="narrow">窄面板</button><button id="wide">宽面板</button><span id="host-status"></span></header><iframe id="app" title="能力管理器验收面板"></iframe><script type="module" src="/bridge.js"></script></html>';
let origin;
const http = createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.headers.host !== new URL(origin).host) { res.writeHead(403).end(); return; }
  try {
    if (req.method === 'GET' && req.url === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(page); }
    else if (req.method === 'GET' && req.url === '/dashboard') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(resource.contents[0].text); }
    else if (req.method === 'GET' && req.url === '/bridge.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(bridge.outputFiles[0].text); }
    else if (req.method === 'POST' && req.url === '/tool' && req.headers.origin === origin && req.headers['content-type'] === 'application/json') {
      let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 65536) { res.writeHead(413).end(); return; } }
      const params = JSON.parse(body);
      if (!['open_skill_manager', 'query_usage'].includes(params.name)) { res.writeHead(400).end(); return; }
      res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(await client.callTool(params)));
    } else res.writeHead(404).end();
  } catch { res.writeHead(500).end('Acceptance host error'); }
});
await new Promise(resolve => http.listen(0, '127.0.0.1', resolve));
origin = `http://127.0.0.1:${http.address().port}`; console.log(origin);
async function stop() { http.closeAllConnections(); http.close(); await client.close(); await transport.close(); process.exit(0); }
process.stdin.resume(); process.stdin.on('data', data => { if (data.toString().trim() === 'q') stop(); });
process.on('SIGINT', stop); process.on('SIGTERM', stop);
