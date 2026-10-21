import { App } from '@modelcontextprotocol/ext-apps';
const status = document.querySelector('#status');
const list = document.querySelector('#skills');
const search = document.querySelector('#search');
const source = document.querySelector('#source');
const evidence = document.querySelector('#evidence');
const refresh = document.querySelector('#refresh');
const comparisons = document.querySelector('#comparisons');
const checkPlugins = document.querySelector('#check-plugins');
const importUsage = document.querySelector('#import-usage');
const usage = document.querySelector('#usage');
const setBusy = value => { document.querySelectorAll('button').forEach(button => { button.disabled = value; }); };
const planPanel = document.querySelector('#management-plan');
const managementStatus = document.querySelector('#management-status');
const archives = document.querySelector('#archives');
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
    if (current.usage?.instances) {
      const summary = current.usage.instances.find(entry => entry.id === skill.id);
      item.append(textNode('p', summary ? `当前统计期间：显式标记 ${summary.explicitMarkers} · 读取请求 ${summary.readRequests} · 最近信号 ${summary.lastSignalAt || '时间未知'}` : '当前统计期间未观察到唯一归属此实例的信号；不代表从未使用。'));
    }
    if (current.notesAvailable) {
      const annotation = skill.annotation;
      if (annotation?.retain) item.append(textNode('p', '已标记：低频仍需保留（提醒，不改变启停或归档权限）'));
      if (annotation?.contentChanged) item.append(textNode('p', '技能内容已变化，旧备注需重新核对。'));
      const editor = document.createElement('details'); editor.append(textNode('summary', '本地保留备注'));
      const noteLabel = textNode('label', '保留原因或用途区别（最多 1000 字）');
      const note = document.createElement('textarea'); note.maxLength = 1000; note.value = annotation?.note || ''; noteLabel.append(note);
      const retainLabel = textNode('label', '低频仍需保留');
      const retain = document.createElement('input'); retain.type = 'checkbox'; retain.checked = annotation?.retain || false; retainLabel.prepend(retain);
      const save = textNode('button', '保存备注'); save.type = 'button';
      const feedback = textNode('p', '仅保存在本机，不写入 SKILL.md。'); feedback.setAttribute('role', 'status');
      save.addEventListener('click', async () => {
        setBusy(true);
        try {
          receive(await managementCall('save_skill_note', { id: skill.id, fingerprint: skill.fingerprint, note: note.value, retain: retain.checked, expectedRevision: annotation?.revision || 0 }));
          managementStatus.textContent = '本地保留备注已保存。';
        } catch (error) { feedback.textContent = error.message; }
        finally { setBusy(false); }
      });
      editor.append(noteLabel, retainLabel, save, feedback); item.append(editor);
    }
    if (current.managementSupported && ['用户技能', '用户 .agents 技能'].includes(skill.source)) {
      const button = textNode('button', '预览归档'); button.type = 'button';
      button.addEventListener('click', () => preview('preview_skill_archive', { skillId: skill.id }));
      item.append(button);
    }
    return item;
  }));
  if (!filtered.length) list.append(textNode('li', '没有匹配项。请检查筛选条件与扫描问题。'));
}
function receive(result) {
  const data = result.structuredContent;
  if (data?.mode === 'management-plan') { showPlan(data.plan); return; }
  if (data?.mode === 'management-cancelled') { planPanel.hidden = true; return; }
  if (data?.mode !== 'inventory' || !Array.isArray(data.skills)) {
    status.textContent = '返回数据版本不匹配，请重启服务后重新打开。';
    list.replaceChildren(); return;
  }
  current = data;
  archives.replaceChildren();
  for (const entry of data.archives || []) {
    const row = document.createElement('div');
    const labels = { archived: '已归档', restored: '已恢复', conflict: '原位置冲突', incomplete: '操作未闭合，请检查记录', invalid: '记录无效，请检查' };
    row.append(textNode('p', `${entry.title} · ${labels[entry.status] || entry.status}`));
    if (entry.original) row.append(textNode('p', entry.original));
    if (entry.status === 'archived' && data.managementSupported) {
      const button = textNode('button', '预览恢复'); button.type = 'button';
      button.addEventListener('click', () => preview('preview_skill_restore', { archiveId: entry.id }));
      row.append(button);
    }
    archives.append(row);
  }
  if (!data.archives?.length) archives.append(textNode('p', '尚无可显示的归档记录。'));
  if (data.operation) { planPanel.hidden = true; managementStatus.textContent = data.operation.status === 'archived' ? '已归档。可在“归档与恢复记录”中预览恢复。' : '已恢复至原位置。新会话的发现状态需由宿主重新加载后确认。'; }
  usage.replaceChildren();
  if (data.usage) {
    const u = data.usage, c = u.coverage;
    if (u.instances) usage.append(textNode('p', `有唯一归属信号的文件实例：${u.instances.length} 个（两类信号去重计数；不是逻辑技能总数）`));
    usage.append(textNode('p', `统计期间：${u.period?.from || '不限起点'} 至 ${u.period?.to || '不限终点'}（ISO 时间，终点不含）`));
    usage.append(textNode('p', `已索引 ${c.indexedFiles} / ${c.discoveredFiles} 个发现的日志 · 待处理 ${c.pendingBytes.toLocaleString()} 字节 · 上次导入读取 ${c.bytesRead.toLocaleString()} 字节`));
    usage.append(textNode('p', `已读记录时间范围：${c.from || '未知'} 至 ${c.to || '未知'} · 更新于 ${c.checkedAt}`));
    for (const [kind, label] of [['explicit-marker', '显式标记（意图）'], ['read-request', '读取请求（推断）']]) {
      const count = u.counts[kind];
      usage.append(textNode('p', `${label}：${count.events} 个信号 · ${count.uniqueReferences} 个不同引用 · ${count.resolvedInstances} 个唯一归属的文件实例`));
    }
    usage.append(textNode('p', `坏行 ${c.malformedLines} · 超长跳过 ${c.oversizedLines} · 上次导入重建 ${c.resets} · 读取问题 ${c.issues.length}。有剩余字节时可再次导入；末行尚未写完时需等待日志继续写入。`));
    usage.append(textNode('p', `已排除 ${c.excludedSessionFiles || 0} 个生成子会话的使用信号（含审批审查）。${c.rebuiltForParser ? '旧索引已备份，新规则已开始从头解析；此前计数不再沿用。' : ''}`));
    const details = document.createElement('details');
    details.append(textNode('summary', `证据与统计限制（展示 ${u.events.length} / ${u.totalEvents} 条）`));
    for (const limit of u.limits) details.append(textNode('p', limit));
    for (const issue of c.issues) details.append(textNode('p', `${issue.reason}：${issue.path}`));
    for (const event of u.events) details.append(textNode('p', `${event.kind === 'explicit-marker' ? '显式标记' : '读取请求'} · ${event.reference} · ${event.resolution === 'resolved' ? '唯一归属' : event.resolution === 'ambiguous' ? '归属有歧义' : '未解析归属'} · ${event.timestamp || '时间未知'} · ${event.source}:${event.line}`));
    usage.append(details);
  } else usage.append(textNode('p', '尚未导入本次统计。不能据此判断从未使用；重新导入会从本地索引续读。'));
  const groups = data.comparisons;
  comparisons.replaceChildren(textNode('p', '仅比较 SKILL.md 文本，未比较附带脚本和资源。相同内容不代表可安全删除；同名不同内容也可能是正常版本差异。'));
  if (groups) {
    comparisons.append(textNode('p', `${groups.identicalDocuments.length} 组相同文档 · ${groups.nameConflicts.length} 组同名不同内容`));
    const byId = new Map(data.skills.map(s => [s.id, s]));
    if (groups.descriptionOverlap) {
      const overlap = groups.descriptionOverlap;
      const section = document.createElement('details');
      section.append(textNode('summary', `用途重叠候选（描述词语）：${overlap.totalPairs} 对`));
      section.append(textNode('p', `比较 ${overlap.comparedInstances} / ${overlap.eligibleInstances} 个有效描述；显示 ${overlap.pairs.length} 对。`));
      for (const limit of overlap.limits) section.append(textNode('p', limit));
      for (const pair of overlap.pairs) {
        const detail = document.createElement('details');
        detail.append(textNode('summary', `${pair.ids.map(id => byId.get(id)?.name || id).join(' ↔ ')} · 词语交并比 ${pair.ratio.toFixed(2)}`));
        detail.append(textNode('p', `共同词（${pair.sharedCount} 个，最多列 12 个）：${pair.sharedTerms.join('、')}`));
        for (const id of pair.ids) { const skill = byId.get(id); if (skill) detail.append(textNode('p', `${skill.path}：${skill.description}`)); }
        section.append(detail);
      }
      comparisons.append(section);
    }
    for (const [label, items] of [['相同文档', groups.identicalDocuments], ['同名不同内容', groups.nameConflicts]]) {
      for (const group of items) {
        const detail = document.createElement('details');
        detail.append(textNode('summary', `${label}：${group.name || group.fingerprint.slice(0, 12)} · ${group.ids.length} 个实例`));
        for (const id of group.ids) detail.append(textNode('p', byId.get(id)?.path || '未解析实例'));
        comparisons.append(detail);
      }
    }
  } else comparisons.append(textNode('p', '当前服务尚未提供比较结果，重新加载服务后可查看。'));
  const previousSource = source.value;
  source.replaceChildren(textNode('option', '全部来源'), ...[...new Set(data.skills.map(s => s.source))].map(s => { const option = textNode('option', s); option.value = s; return option; }));
  source.options[0].value = '';
  if ([...source.options].some(option => option.value === previousSource)) source.value = previousSource;
  evidence.replaceChildren(...data.limits.map(s => textNode('p', s)), ...data.coverage.map(s => textNode('p', `范围：${s.path}`)), ...data.issues.map(s => textNode('p', `${s.reason}：${s.path}`)));
  if (data.pluginRegistry) evidence.prepend(textNode('p', `插件安装记录：${data.pluginRegistry.plugins.length} 条 · ${data.pluginRegistry.checkedAt}。以当前 CLI 用户环境为准；未匹配不证明未安装。普通扫描保留该次核对快照，不自动重新查询。`));
  render();
}
async function managementCall(name, args) {
  const result = await app.callServerTool({ name, arguments: args });
  if (result.isError) throw new Error(result.content?.find(c => c.type === 'text')?.text || '操作失败');
  return result;
}
async function preview(name, args) {
  setBusy(true); managementStatus.textContent = '正在核对文件并生成预览…';
  try { const result = await managementCall(name, args); showPlan(result.structuredContent.plan); managementStatus.textContent = ''; }
  catch (error) { managementStatus.textContent = error.message; }
  finally { setBusy(false); }
}
function showPlan(plan) {
  planPanel.hidden = false;
  planPanel.replaceChildren(textNode('h2', plan.action === 'archive' ? '归档预览' : '恢复预览'), textNode('p', plan.title), textNode('p', plan.impact), textNode('p', `文件 ${plan.files} 个 · ${plan.bytes} 字节 · 有效至 ${new Date(plan.expiresAt).toLocaleTimeString()}`), textNode('p', `原位置：${plan.original}`), textNode('p', `归档位置：${plan.destination}`));
  const confirm = textNode('button', plan.action === 'archive' ? '执行归档' : '执行恢复'); confirm.type = 'button';
  const cancel = textNode('button', '取消预览'); cancel.type = 'button';
  confirm.addEventListener('click', async () => {
    setBusy(true);
    try { receive(await managementCall('execute_skill_plan', { token: plan.token })); }
    catch (error) { managementStatus.textContent = `${error.message} 请重新预览后再操作。`; planPanel.hidden = true; }
    finally { setBusy(false); }
  });
  cancel.addEventListener('click', async () => {
    setBusy(true);
    try { await managementCall('cancel_skill_plan', { token: plan.token }); planPanel.hidden = true; managementStatus.textContent = '预览已取消。'; }
    catch (error) { managementStatus.textContent = error.message; }
    finally { setBusy(false); }
  });
  planPanel.append(confirm, cancel);
  planPanel.scrollIntoView({ block: 'nearest' });
}
app.ontoolresult = receive;
refresh.addEventListener('click', async () => {
  setBusy(true);
  status.textContent = '正在重新扫描…';
  try { receive(await app.callServerTool({ name: 'open_skill_manager', arguments: {} })); }
  catch { status.textContent = '扫描失败，保留上一次清单。请检查 MCP 连接后重试。'; }
  finally { setBusy(false); }
});
checkPlugins.addEventListener('click', async () => {
  setBusy(true);
  status.textContent = '正在核对插件安装状态…';
  try {
    const result = await app.callServerTool({ name: 'check_plugin_status', arguments: {} });
    if (result.isError) throw new Error('query failed');
    receive(result);
  } catch { status.textContent = '安装状态查询失败，保留上一次结果。请检查 CLI、登录环境与网络。'; }
  finally { setBusy(false); }
});
importUsage.addEventListener('click', async () => {
  setBusy(true);
  status.textContent = '正在增量导入本机日志…';
  try {
    const result = await app.callServerTool({ name: 'import_usage', arguments: {} });
    if (result.isError) throw new Error('import failed');
    receive(result);
  } catch { status.textContent = '导入失败，保留原结果和已有索引。请检查日志权限、索引或并发导入状态。'; }
  finally { setBusy(false); }
});
search.addEventListener('input', render);
async function queryUsage(all = false) {
  const fromInput = document.querySelector('#usage-from'), toInput = document.querySelector('#usage-to');
  const args = {};
  if (!all) {
    if (fromInput.value) args.from = new Date(`${fromInput.value}T00:00:00`).toISOString();
    if (toInput.value) { const end = new Date(`${toInput.value}T00:00:00`); end.setDate(end.getDate() + 1); args.to = end.toISOString(); }
    if (args.from && args.to && args.from >= args.to) { status.textContent = '开始日期不能晚于结束日期。'; return; }
  }
  setBusy(true);
  try {
    receive(await managementCall('query_usage', args));
    if (all) { fromInput.value = ''; toInput.value = ''; }
  } catch (error) { status.textContent = error.message; }
  finally { setBusy(false); }
}
document.querySelector('#query-usage').addEventListener('click', () => queryUsage());
document.querySelector('#all-usage').addEventListener('click', () => queryUsage(true));
source.addEventListener('change', render);
app.connect().catch(() => { status.textContent = '宿主连接失败。需要在支持 MCP Apps 的宿主内打开。'; });
