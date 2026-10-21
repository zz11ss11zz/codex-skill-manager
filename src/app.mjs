import { App } from '@modelcontextprotocol/ext-apps';
const status = document.querySelector('#status');
const list = document.querySelector('#skills');
const search = document.querySelector('#search');
const source = document.querySelector('#source');
const evidence = document.querySelector('#evidence');
const refresh = document.querySelector('#refresh');
const comparisons = document.querySelector('#comparisons');
const checkPlugins = document.querySelector('#check-plugins');
let current = null;
const app = new App({ name: 'codex-skill-manager', version: '0.0.1' }, {});
const textNode = (tag, value) => { const node = document.createElement(tag); node.textContent = value; return node; };
function render() {
  if (!current) return;
  const query = search.value.toLocaleLowerCase();
  const filtered = current.skills.filter(s => (!source.value || s.source === source.value) && `${s.name} ${s.description} ${s.path} ${s.owner?.name || ''}`.toLocaleLowerCase().includes(query));
  status.textContent = `显示 ${filtered.length} / ${current.skills.length} 个文件实例 · ${current.issues.length} 个扫描问题 · ${new Date(current.scannedAt).toLocaleString()}`;
  list.replaceChildren(...filtered.map(skill => {
    const item = document.createElement('li');
    const details = document.createElement('details');
    details.append(textNode('summary', '来源与文件证据'), textNode('p', skill.path), textNode('p', `SHA-256：${skill.fingerprint}`));
    if (skill.owner) details.append(textNode('p', `${skill.owner.marketplace} / ${skill.owner.name} / ${skill.owner.version}`), textNode('p', `归属证据：${skill.owner.manifest}`));
    if (skill.pluginStatus) details.append(textNode('p', `安装核对：${skill.pluginStatus.evidence} · ${skill.pluginStatus.checkedAt} · ${skill.pluginStatus.id}`));
    item.append(textNode('h2', skill.name), textNode('p', `${skill.source} · ${skill.state}`), textNode('p', skill.description), details);
    return item;
  }));
  if (!filtered.length) list.append(textNode('li', '没有匹配项。请检查筛选条件与扫描问题。'));
}
function receive(result) {
  const data = result.structuredContent;
  if (data?.mode !== 'inventory' || !Array.isArray(data.skills)) {
    status.textContent = '返回数据版本不匹配，请重启服务后重新打开。';
    list.replaceChildren(); return;
  }
  current = data;
  const groups = data.comparisons;
  comparisons.replaceChildren(textNode('p', '仅比较 SKILL.md 文本，未比较附带脚本和资源。相同内容不代表可安全删除；同名不同内容也可能是正常版本差异。'));
  if (groups) {
    comparisons.append(textNode('p', `${groups.identicalDocuments.length} 组相同文档 · ${groups.nameConflicts.length} 组同名不同内容`));
    const byId = new Map(data.skills.map(s => [s.id, s]));
    for (const [label, items] of [['相同文档', groups.identicalDocuments], ['同名不同内容', groups.nameConflicts]]) {
      for (const group of items) {
        const detail = document.createElement('details');
        detail.append(textNode('summary', `${label}：${group.name || group.fingerprint.slice(0, 12)} · ${group.ids.length} 个实例`));
        for (const id of group.ids) detail.append(textNode('p', byId.get(id)?.path || '未解析实例'));
        comparisons.append(detail);
      }
    }
  } else comparisons.append(textNode('p', '当前服务尚未提供比较结果，重新加载服务后可查看。'));
  source.replaceChildren(textNode('option', '全部来源'), ...[...new Set(data.skills.map(s => s.source))].map(s => { const option = textNode('option', s); option.value = s; return option; }));
  source.options[0].value = '';
  evidence.replaceChildren(...data.limits.map(s => textNode('p', s)), ...data.coverage.map(s => textNode('p', `范围：${s.path}`)), ...data.issues.map(s => textNode('p', `${s.reason}：${s.path}`)));
  if (data.pluginRegistry) evidence.prepend(textNode('p', `插件安装记录：${data.pluginRegistry.plugins.length} 条 · ${data.pluginRegistry.checkedAt}。以当前 CLI 用户环境为准；未匹配不证明未安装。重新扫描将清除本次核对结果。`));
  render();
}
app.ontoolresult = receive;
refresh.addEventListener('click', async () => {
  refresh.disabled = true;
  checkPlugins.disabled = true;
  status.textContent = '正在重新扫描…';
  try { receive(await app.callServerTool({ name: 'open_skill_manager', arguments: {} })); }
  catch { status.textContent = '扫描失败，保留上一次清单。请检查 MCP 连接后重试。'; }
  finally { refresh.disabled = false; checkPlugins.disabled = false; }
});
checkPlugins.addEventListener('click', async () => {
  checkPlugins.disabled = true;
  refresh.disabled = true;
  status.textContent = '正在核对插件安装状态…';
  try {
    const result = await app.callServerTool({ name: 'check_plugin_status', arguments: {} });
    if (result.isError) throw new Error('query failed');
    receive(result);
  } catch { status.textContent = '安装状态查询失败，保留上一次结果。请检查 CLI、登录环境与网络。'; }
  finally { checkPlugins.disabled = false; refresh.disabled = false; }
});
search.addEventListener('input', render);
source.addEventListener('change', render);
app.connect().catch(() => { status.textContent = '宿主连接失败。需要在支持 MCP Apps 的宿主内打开。'; });
