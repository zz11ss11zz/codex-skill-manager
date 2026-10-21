import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { pathToFileURL } from 'node:url';
import { scanInventory } from './inventory.mjs';
import { loadPluginStatus, applyPluginStatus } from './plugins.mjs';

export function createServer(roots, { queryPlugins = loadPluginStatus } = {}) {
// Resource identity follows its content so hosts cannot reuse a previous UI build.
// Keep the content immutable for the lifetime of this server instance.
const html = readFileSync(new URL('../dist/dashboard.html', import.meta.url), 'utf8');
const revision = createHash('sha256').update(html).digest('hex').slice(0, 16);
const uri = `ui://codex-skill-manager/dashboard-${revision}.html`;
const server = new McpServer({ name: 'codex-skill-manager', version: '0.0.1' });
server.registerResource('dashboard', uri, { mimeType: 'text/html;profile=mcp-app' }, async () => ({
  contents: [{ uri, mimeType: 'text/html;profile=mcp-app', text: html }],
}));
server.registerTool('open_skill_manager', {
  title: '能力管理器',
  description: '只读扫描标准技能目录与插件缓存，打开能力管理器。不读取聊天或凭据；缓存不代表已安装或启用。',
  inputSchema: {},
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  _meta: { ui: { resourceUri: uri }, 'openai/ui': { entrypoints: [{ type: 'global' }] } },
}, async () => {
  const inventory = await scanInventory(roots);
  return { content: [{ type: 'text', text: `发现 ${inventory.skills.length} 个技能文件实例；${inventory.issues.length} 个扫描问题。启用状态与使用统计尚未核实。` }], structuredContent: inventory };
});
server.registerTool('check_plugin_status', {
  title: '核对插件安装状态',
  description: '显式调用官方 codex plugin list --json 核对插件安装版本和启用状态；CLI 可能查询已配置的插件市场。不上传技能文件或聊天。',
  inputSchema: {},
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
}, async () => {
  try {
    const status = await queryPlugins();
    const inventory = applyPluginStatus(await scanInventory(roots), status);
    return { content: [{ type: 'text', text: `已读取 ${status.plugins.length} 条插件安装记录；未匹配缓存不等于未安装。` }], structuredContent: inventory };
  } catch {
    return { isError: true, content: [{ type: 'text', text: '无法读取插件安装清单。请检查 Codex CLI 是否可用、登录环境和网络；保留现有清单，不推断安装状态。' }] };
  }
});
return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await createServer().connect(new StdioServerTransport());
}
