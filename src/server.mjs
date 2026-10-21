import { readFile } from 'node:fs/promises';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const uri = 'ui://codex-skill-manager/dashboard.html';
const server = new McpServer({ name: 'codex-skill-manager', version: '0.0.1' });
server.registerResource('dashboard', uri, { mimeType: 'text/html;profile=mcp-app' }, async () => ({
  contents: [{ uri, mimeType: 'text/html;profile=mcp-app', text: await readFile(new URL('../dist/dashboard.html', import.meta.url), 'utf8') }],
}));
server.registerTool('open_skill_manager', {
  title: '能力管理器',
  description: '打开能力管理器的侧栏集成原型。仅返回合成示例，不读取本机技能或聊天。',
  inputSchema: {},
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  _meta: { ui: { resourceUri: uri }, 'openai/ui': { entrypoints: [{ type: 'global' }] } },
}, async () => ({
  content: [{ type: 'text', text: '能力管理器侧栏原型；合成示例数据，非实际统计。' }],
  structuredContent: {
    mode: 'synthetic', coverage: null,
    skills: [
      { name: '示例：科研绘图', source: '用户技能', state: '演示', description: '展示技能名称、来源与状态。' },
      { name: '示例：资料整理', source: '插件附带', state: '演示', description: '后续将展示插件归属与证据。' },
    ],
  },
}));
await server.connect(new StdioServerTransport());
