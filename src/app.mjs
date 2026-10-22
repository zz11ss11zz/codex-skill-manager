import { App } from '@modelcontextprotocol/ext-apps';
import { createActivityPanel } from './activity-ui.mjs';
const updateActivity = createActivityPanel(document.querySelector('#activity-panel'));
const status = document.querySelector('#status');
const app = new App({ name: 'codex-skill-manager', version: '0.0.1' }, {});
let connected = false, hasData = false, lastRefresh = 0, pending = null;
function receive(result) {
  const data = result.structuredContent;
  if (result.isError || data?.mode !== 'inventory' || !Array.isArray(data.skills)) {
    status.hidden = false;
    status.textContent = '统计数据暂不可读取，请重新打开能力管理器。';
    return;
  }
  updateActivity(data);
  hasData = true;
  lastRefresh = Date.now();
  status.hidden = true;
}
app.ontoolresult = receive;
async function refresh() {
  if (!connected || pending || (hasData && Date.now() - lastRefresh < 1000)) return;
  pending = app.callServerTool({ name: 'open_skill_manager', arguments: {} });
  try { receive(await pending); }
  catch {
    status.hidden = false;
    status.textContent = hasData ? '统计刷新失败，暂时保留上次结果；重新进入面板时会重试。' : '统计数据暂不可读取，请重新打开能力管理器。';
  } finally { pending = null; }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) void refresh(); });
window.addEventListener('focus', () => { void refresh(); });
app.connect().then(() => {
  connected = true;
  // A global panel may open without an initial tool result.
  if (!hasData) void refresh();
}).catch(() => {
  status.hidden = false;
  status.textContent = '管理器连接未完成，请重新打开面板。';
});
