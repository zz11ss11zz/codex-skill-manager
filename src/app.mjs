import { App } from '@modelcontextprotocol/ext-apps';
const status = document.querySelector('#status');
const list = document.querySelector('#skills');
const app = new App({ name: 'codex-skill-manager', version: '0.0.1' }, {});
app.ontoolresult = result => {
  const data = result.structuredContent;
  if (data?.mode !== 'synthetic' || !Array.isArray(data.skills)) {
    status.textContent = '返回数据无法识别。请重新打开原型。';
    list.replaceChildren();
    return;
  }
  status.textContent = '已收到 MCP 数据 · 合成示例 · 无真实统计覆盖';
  list.replaceChildren(...data.skills.map(skill => {
    const item = document.createElement('li');
    const heading = document.createElement('h2');
    const meta = document.createElement('p');
    const description = document.createElement('p');
    heading.textContent = skill.name;
    meta.textContent = `${skill.source} · ${skill.state}`;
    description.textContent = skill.description;
    item.append(heading, meta, description);
    return item;
  }));
};
app.connect().catch(() => { status.textContent = '宿主连接失败。需要在支持 MCP Apps 的宿主内打开。'; });
