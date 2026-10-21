import { AppBridge, PostMessageTransport } from '@modelcontextprotocol/ext-apps/app-bridge';
const frame = document.querySelector('#app');
const bridge = new AppBridge(null, { name: 'synthetic-test-host', version: '1.0.0' }, { serverTools: {} });
const call = async params => {
  const response = await fetch('/tool', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params) });
  if (!response.ok) throw new Error(`Synthetic host HTTP ${response.status}`);
  return response.json();
};
bridge.oncalltool = call;
bridge.oninitialized = async () => { await bridge.sendToolInput({ arguments: {} }); await bridge.sendToolResult(await call({ name: 'open_skill_manager', arguments: {} })); };
bridge.onerror = error => { document.querySelector('#host-status').textContent = error.message; };
await bridge.connect(new PostMessageTransport(frame.contentWindow, frame.contentWindow));
frame.src = '/dashboard';
document.querySelector('#narrow').addEventListener('click', () => { frame.style.width = '360px'; });
document.querySelector('#wide').addEventListener('click', () => { frame.style.width = '960px'; });
