import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { pathToFileURL } from 'node:url';
import { scanInventory } from './inventory.mjs';
import { loadPluginStatus, applyPluginStatus } from './plugins.mjs';
import { UsageIndex } from './usage-index.mjs';
import { ArchiveManager } from './archive.mjs';
import { z } from 'zod';
import { SkillNotes } from './skill-notes.mjs';
import { Adoptions } from './adoptions.mjs';
import { registerDashboard } from './dashboard-resource.mjs';

export function createServer(roots, { queryPlugins = loadPluginStatus, usageIndex = new UsageIndex(), archiveManager = new ArchiveManager({ roots }), skillNotes = new SkillNotes(), adoptions = new Adoptions() } = {}) {
let pluginSnapshot = null, usageSnapshot = null;
let usagePeriod = { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };
async function inventoryWithArchives() {
  let inventory = await scanInventory(roots);
  if (pluginSnapshot) inventory = applyPluginStatus(inventory, pluginSnapshot);
  // Restore persisted statistics after a service restart; never import chat logs on open.
  if (!usageSnapshot) {
    try { usageSnapshot = await usageIndex.query(inventory.skills, usagePeriod); }
    catch (error) {
      if (error.code !== 'ENOENT') inventory.issues.push({ path: usageIndex.options?.stateFile || '本地使用索引', reason: '已有使用统计无法读取；请检查索引，原文件未修改' });
    }
  }
  inventory.usage = usageSnapshot;
  try { inventory.adoptions = await adoptions.summary(usagePeriod); }
  catch { inventory.adoptions = null; inventory.issues.push({path:adoptions.file,reason:'采用记录无法读取；未将读取失败当作零使用'}); }
  inventory.managementSupported = process.platform === 'win32';
  try {
    const notes = await skillNotes.read();
    inventory.notesAvailable = true;
    for (const skill of inventory.skills) {
      const entry = notes.entries[skill.id];
      if (entry) skill.annotation = { ...entry, contentChanged: entry.fingerprint !== skill.fingerprint };
    }
  } catch { inventory.notesAvailable = false; inventory.issues.push({ path: skillNotes.file, reason: '本地备注无法读取，已保留原文件并禁用编辑' }); }
  try { inventory.archives = await archiveManager.list(); }
  catch { inventory.archives = []; inventory.issues.push({ path: archiveManager.archiveRoot, reason: '归档记录无法读取' }); }
  return inventory;
}
const server = new McpServer({ name: 'codex-skill-manager', version: '0.0.1' });
const uri = registerDashboard(server);
server.registerTool('open_skill_manager', {
  title: '能力管理器',
  description: '只读扫描标准技能目录与插件缓存，打开能力管理器。不读取聊天或凭据；缓存不代表已安装或启用。',
  inputSchema: {},
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  _meta: { ui: { resourceUri: uri }, 'openai/ui': { entrypoints: [{ type: 'global' }] } },
}, async () => {
  const inventory = await inventoryWithArchives();
  return { content: [{ type: 'text', text: `发现 ${inventory.skills.length} 个技能文件实例；${inventory.issues.length} 个扫描问题。安装和使用信号按各自核对时间展示。` }], structuredContent: inventory };
});
server.registerTool('check_plugin_status', {
  title: '核对插件安装状态',
  description: '显式调用官方 codex plugin list --json 核对插件安装版本和启用状态；CLI 可能查询已配置的插件市场。不上传技能文件或聊天。',
  inputSchema: {},
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
}, async () => {
  try {
    const status = await queryPlugins();
    pluginSnapshot = status;
    const inventory = await inventoryWithArchives();
    return { content: [{ type: 'text', text: `已读取 ${status.plugins.length} 条插件安装记录；未匹配缓存不等于未安装。` }], structuredContent: inventory };
  } catch {
    return { isError: true, content: [{ type: 'text', text: '无法读取插件安装清单。请检查 Codex CLI 是否可用、登录环境和网络；保留现有清单，不推断安装状态。' }] };
  }
});
server.registerTool('import_usage', {
  title: '增量导入本机使用信号',
  description: '读取本机 Codex sessions 和 archived_sessions 日志，增量提取显式标记与读取请求。只将信号、来源定位和读取位置写入项目 .local/usage-index.json，不保存聊天正文，不联网。',
  inputSchema: {},
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
}, async () => {
  try {
    const inventory = await inventoryWithArchives();
    usageSnapshot = await usageIndex.refresh(inventory.skills, usagePeriod);
    inventory.usage = usageSnapshot;
    return { content: [{ type: 'text', text: `已索引 ${inventory.usage.coverage.indexedFiles} 个日志文件；剩余 ${inventory.usage.coverage.pendingBytes} 字节尚未处理。信号不等于成功执行次数。` }], structuredContent: inventory };
  } catch {
    return { isError: true, content: [{ type: 'text', text: '导入失败，保留之前的索引。请检查日志权限、本地索引格式或是否已有导入占用；恢复方法见仓库本地验证文档。' }] };
  }
});
server.registerTool('query_usage', {
  title: '按期间查询使用信号', description: '只读查询已有本地索引，不读取新聊天日志。时间需带时区，包含起点、不包含终点；省略两端查询全部已索引时间。',
  inputSchema: { from: z.string().datetime({ offset: true }).optional(), to: z.string().datetime({ offset: true }).optional(), timeZone: z.string().max(80).optional() },
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
}, async period => {
  try {
    const inventory = await inventoryWithArchives();
    const adoptionSummary = await adoptions.summary(period);
    let result = null;
    try { result = await usageIndex.query(inventory.skills, period); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    usagePeriod = period; usageSnapshot = result; inventory.usage = result;
    inventory.adoptions = adoptionSummary;
    return { content: [{ type: 'text', text: '已按期间查询已有索引；未读取新日志。' }], structuredContent: inventory };
  } catch { return { isError: true, content: [{ type: 'text', text: '查询失败。请检查时间范围，并先导入一次使用信号更新索引；原结果保留。' }] }; }
});
const managementError = error => ({ isError: true, content: [{ type: 'text', text: error.code ? '文件操作失败，请检查路径权限及操作记录；未确认成功。' : error.message }] });
server.registerTool('record_skill_use', {
  title: '记录技能采用',
  description: '采用技能时批量记录。id 为新批次唯一 ID（重试沿用）；skills 为技能名、插件名:技能名或准确路径，可重复，每项计一次。不用于历史补记或仅阅读审计。',
  inputSchema: {id:z.string().regex(/^[A-Za-z0-9_-]{16,80}$/),skills:z.array(z.string().min(1).max(1024)).min(1).max(32)},
  annotations: {readOnlyHint:false,destructiveHint:false,openWorldHint:false},
}, async args => {
  try { await adoptions.record(args, async () => (await scanInventory(roots)).skills); return {content:[{type:'text',text:'OK'}]}; }
  catch (error) { return managementError(error); }
});
server.registerTool('save_skill_note', {
  title: '保存技能保留备注', description: '保存用户提供的本地备注和保留标记，不修改技能文件或启停状态。需基于当前文件指纹和备注版本，冲突时拒绝覆盖。',
  inputSchema: { id: z.string().regex(/^[a-f0-9]{64}$/), fingerprint: z.string().regex(/^[a-f0-9]{64}$/), note: z.string().max(1000), retain: z.boolean(), expectedRevision: z.number().int().nonnegative() },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
}, async args => {
  try {
    const current = (await scanInventory(roots)).skills.find(s => s.id === args.id);
    if (!current || current.fingerprint !== args.fingerprint) throw new Error('技能内容已变化或不存在，请重新扫描后编辑');
    await skillNotes.save(args);
    return { content: [{ type: 'text', text: '本地备注已保存；技能内容和启停状态不变。' }], structuredContent: await inventoryWithArchives() };
  } catch (error) { return managementError(error); }
});
server.registerTool('preview_skill_archive', {
  title: '预览用户技能归档', description: '只读预览用户技能目录的归档范围与影响，不执行移动。系统和插件内容不可归档。',
  inputSchema: { skillId: z.string().regex(/^[0-9a-f]{64}$/) }, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
}, async ({ skillId }) => {
  try { const plan = await archiveManager.previewArchive(skillId); return { content: [{ type: 'text', text: `${plan.title}：${plan.files} 个文件，${plan.bytes} 字节。${plan.impact}` }], structuredContent: { mode: 'management-plan', plan } }; }
  catch (error) { return managementError(error); }
});
server.registerTool('preview_skill_restore', {
  title: '预览用户技能恢复', description: '只读核对已归档技能并生成恢复预览；原位置已有内容时拒绝覆盖。',
  inputSchema: { archiveId: z.string().uuid() }, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
}, async ({ archiveId }) => {
  try { const plan = await archiveManager.previewRestore(archiveId); return { content: [{ type: 'text', text: `${plan.title}：${plan.impact}` }], structuredContent: { mode: 'management-plan', plan } }; }
  catch (error) { return managementError(error); }
});
server.registerTool('execute_skill_plan', {
  title: '执行已预览的归档或恢复', description: '仅在用户已针对该具体预览明确要求执行后调用。按一次性预览令牌移动用户技能目录，保留恢复记录；系统和插件只读。',
  inputSchema: { token: z.string().uuid() }, annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
}, async ({ token }) => {
  try { const operation = await archiveManager.execute(token); const inventory = await inventoryWithArchives(); inventory.operation = operation; return { content: [{ type: 'text', text: operation.status === 'archived' ? '已归档，可从归档记录恢复。' : '已恢复至原位置。' }], structuredContent: inventory }; }
  catch (error) { return managementError(error); }
});
server.registerTool('cancel_skill_plan', {
  title: '取消管理预览', description: '使尚未执行的归档或恢复预览失效，不修改技能文件。',
  inputSchema: { token: z.string().uuid() }, annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
}, async ({ token }) => { archiveManager.cancel(token); return { content: [{ type: 'text', text: '预览已取消。' }], structuredContent: { mode: 'management-cancelled' } }; });
return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await createServer().connect(new StdioServerTransport());
}
