import { App } from '@modelcontextprotocol/ext-apps';
const status = document.querySelector('#status');
const list = document.querySelector('#skills');
const search = document.querySelector('#search');
const source = document.querySelector('#source');
const evidence = document.querySelector('#evidence');
const refresh = document.querySelector('#refresh');
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
  source.replaceChildren(textNode('option', '全部来源'), ...[...new Set(data.skills.map(s => s.source))].map(s => { const option = textNode('option', s); option.value = s; return option; }));
  source.options[0].value = '';
  evidence.replaceChildren(...data.limits.map(s => textNode('p', s)), ...data.coverage.map(s => textNode('p', `范围：${s.path}`)), ...data.issues.map(s => textNode('p', `${s.reason}：${s.path}`)));
  render();
}
app.ontoolresult = receive;
refresh.addEventListener('click', async () => {
  refresh.disabled = true;
  status.textContent = '正在重新扫描…';
  try { receive(await app.callServerTool({ name: 'open_skill_manager', arguments: {} })); }
  catch { status.textContent = '扫描失败，保留上一次清单。请检查 MCP 连接后重试。'; }
  finally { refresh.disabled = false; }
});
search.addEventListener('input', render);
source.addEventListener('change', render);
app.connect().catch(() => { status.textContent = '宿主连接失败。需要在支持 MCP Apps 的宿主内打开。'; });
