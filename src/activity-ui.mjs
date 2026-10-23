import { translator } from './i18n.mjs';
import { activityView, calendarDays } from './activity.mjs';
const node = (tag, value, className) => { const el = document.createElement(tag); if (value !== undefined) el.textContent = value; if (className) el.className = className; return el; };
export function createActivityPanel(root, locale = 'zh') {
  let t = translator(locale);
  let current, kind = 'plugins', year = new Date().getFullYear(), metric = 'calls';
  const heading = node('div', undefined, 'activity-heading');
  const title = node('h2', t("插件工具调用"));
  const tabs = node('div', undefined, 'activity-tabs'); tabs.setAttribute('aria-label', t("活动类型"));
  const skillButton = node('button', 'Skill'), pluginButton = node('button', t("插件"));
  for (const button of [pluginButton, skillButton]) { button.type = 'button'; tabs.append(button); }
  skillButton.addEventListener('click', () => { kind = 'skills'; metric = 'adoptions'; render(); });
  pluginButton.addEventListener('click', () => { kind = 'plugins'; metric = 'calls'; render(); });
  const yearSelect = node('select'); yearSelect.setAttribute('aria-label', t("活动年份"));
  yearSelect.addEventListener('change', () => { year = Number(yearSelect.value); dateFrom.value = `${year}-01-01`; dateTo.value = `${year}-12-31`; render(); });
  heading.append(title, tabs, yearSelect);
  const caption = node('p', undefined, 'activity-caption'), scroll = node('div', undefined, 'calendar-scroll');
  const calendar = node('div', undefined, 'activity-calendar'); scroll.append(calendar);
  const tooltip = node('p', t("将鼠标移到日期上，或用键盘选择日期查看使用量。"), 'activity-tooltip'); tooltip.setAttribute('role', 'status');
  const legend = node('div', undefined, 'activity-legend'); legend.append(node('span', t("少")));
  for (let i = 0; i < 5; i++) legend.append(node('span', undefined, `heat-swatch level-${i}`));
  legend.append(node('span', t("多")), node('span', t("斜线：无覆盖 / 未查询")));
  const rankings = node('div', undefined, 'activity-rankings');
  const entityPanel = node('section', undefined, 'entity-panel');
  const entityHeading = node('div', undefined, 'entity-heading'), entityTitle = node('h3');
  const datesControl = node('div', undefined, 'entity-dates');
  const dateFrom = node('input'), dateTo = node('input');
  for (const [input, text, suffix] of [[dateFrom, t("开始日期"), '01-01'], [dateTo, t("结束日期"), '12-31']]) {
    input.type = 'date'; input.value = `${year}-${suffix}`; input.setAttribute('aria-label', text);
    const label = node('label', text); label.append(input); datesControl.append(label);
    input.addEventListener('change', render);
  }
  entityHeading.append(entityTitle, datesControl);
  const entityCaption = node('p', undefined, 'activity-caption'), entityGrid = node('div', undefined, 'entity-grid');
  const entityTip = node('p', undefined, 'activity-tooltip'); entityTip.setAttribute('role', 'status');
  entityPanel.append(entityHeading, entityCaption, entityGrid, entityTip);
  const note = node('p', undefined, 'activity-note');
  root.append(heading, caption, scroll, tooltip, legend, entityPanel, rankings, note);
  function render() {
    if (!current) return;
    skillButton.setAttribute('aria-pressed', String(kind === 'skills')); pluginButton.setAttribute('aria-pressed', String(kind === 'plugins'));
    const adopting = metric === 'adoptions', calling = metric === 'calls';
    title.textContent = calling ? t("插件工具调用") : t("Skill工具调用");
    const usage = calling ? current.pluginCalls : adopting ? current.adoptions : current.usage;
    const historical = (adopting ? usage?.catalog || [] : []).filter(s => !current.skills.some(p => p.id === s.id)).map(s => ({...s,historical:true,source:t("{0}（已不在当前清单）", s.source)}));
    const view = activityView({...current,skills:[...current.skills,...historical],usage}, kind, year, metric);
    tooltip.textContent = t("将鼠标移到日期上，或用键盘选择日期查看使用量。");
    const years = [...new Set([year, new Date().getFullYear(), ...(usage?.activity?.days || []).map(d => Number(d.date.slice(0, 4)))])].sort((a, b) => b - a);
    yearSelect.replaceChildren(...years.map(y => { const option = node('option', t("{0} 年", y)); option.value = String(y); return option; })); yearSelect.value = String(year);
    const label = calling ? t("工具调用尝试") : adopting ? t("采用") : metric === 'reads' ? t("读取请求") : t("显式标记");
    caption.hidden = view.ready;
    caption.textContent = view.ready ? '' : adopting ? t("采用记录暂不可读取，请重新打开管理器。") : t("插件调用记录暂不可读取。");
    calendar.replaceChildren();
    const dates = calendarDays(year), columns = dates.length / 7;
    calendar.style.setProperty('--weeks', columns);
    const months = node('div', undefined, 'calendar-months');
    let lastMonth = '';
    for (let col = 0; col < columns; col++) {
      const date = dates.slice(col * 7, col * 7 + 7).find(Boolean), month = date?.slice(5, 7);
      months.append(node('span', month !== lastMonth ? t("{0}月", Number(month)) : '')); lastMonth = month;
    }
    const cells = node('div', undefined, 'calendar-cells'); cells.setAttribute('aria-label', t("{0} 年每日{1}", year, label));
    const maximum = Math.max(1, ...view.days.values());
    const {start: lower, end: upper, incomplete} = view.coverage;
    const buttons = [];
    for (const date of dates) {
      if (!date) { cells.append(node('span', undefined, 'heat-empty')); continue; }
      const count = view.days.get(date) || 0;
      const unknown = !count && (incomplete || !lower || !upper || date < lower || date > upper);
      const level = count ? Math.min(4, Math.max(1, Math.ceil(4 * count / maximum))) : 0;
      const button = node('button', undefined, `heat-cell ${unknown ? 'heat-unknown' : `level-${level}`}`); button.type = 'button'; button.tabIndex = buttons.length ? -1 : 0;
      const description = `${date}：${unknown ? t("无覆盖或未查询，不能判断使用量") : t("{0} 次{1}", count, label)}`;
      button.title = description; button.setAttribute('aria-label', description);
      const show = () => { tooltip.textContent = description; };
      button.addEventListener('mouseenter', show); button.addEventListener('focus', show); button.addEventListener('click', show);
      button.addEventListener('keydown', event => {
        const delta = { ArrowRight: 7, ArrowLeft: -7, ArrowDown: 1, ArrowUp: -1 }[event.key];
        if (delta === undefined) return;
        event.preventDefault(); const index = buttons.indexOf(button), next = buttons[Math.min(buttons.length - 1, Math.max(0, index + delta))];
        button.tabIndex = -1; next.tabIndex = 0; next.focus();
      });
      buttons.push(button); cells.append(button);
    }
    calendar.append(months, cells);
    entityTitle.textContent = t("{0}使用量排序", kind === 'plugins' ? t("插件") : 'Skill');
    for (const input of [dateFrom, dateTo]) { input.min = `${year}-01-01`; input.max = `${year}-12-31`; }
    const validRange = dateFrom.value && dateTo.value && dateFrom.value <= dateTo.value && dateFrom.checkValidity() && dateTo.checkValidity();
    let rankingView = view;
    rankings.hidden = !validRange;
    entityGrid.replaceChildren();
    entityTip.textContent = t("悬停或聚焦格子查看名称与次数。");
    if (!validRange) {
      entityCaption.textContent = t("请选择 {0} 年内有效的起止日期，开始日期不得晚于结束日期。", year);
    } else {
      const ranked = activityView({...current, skills: [...current.skills, ...historical], usage}, kind, year, metric, {from: dateFrom.value, to: dateTo.value});
      rankingView = ranked;
      const coverage = ranked.coverage;
      const scope = coverage.hasOverlap ? t("统计覆盖 {0} 至 {1}{2}", coverage.effectiveFrom, coverage.effectiveTo, coverage.incomplete ? t("（数据不完整）") : '') : t("所选日期无统计覆盖");
      entityCaption.textContent = t("{0} 至 {1} · {2} · 已记录 {3} 次{4} · 每格一项，从左到右、从上到下按次数降序 · 颜色越深次数越多", dateFrom.value, dateTo.value, scope, ranked.total, label);
      if (!ranked.ready) entityCaption.textContent = t("统计暂不可读取，不将失败当作零。");
      const maxCount = Math.max(1, ...ranked.all.map(e => e.total));
      ranked.all.forEach((entry, index) => {
        const level = entry.total ? Math.min(4, Math.max(1, Math.ceil(4 * entry.total / maxCount))) : 0;
        const description = `${entry.name} · ${entry.detail}：${entry.unknown ? t("无覆盖或归属不明，不能判断使用量") : t("{0} 次{1}{2}", entry.total, label, entry.total ? '' : t("（已覆盖期间无记录）"))}`;
        const cell = node('button', undefined, `heat-cell entity-cell ${entry.unknown ? 'heat-unknown' : `level-${level}`}`); cell.type = 'button';
        cell.title = description; cell.setAttribute('aria-label', t("第 {0} 名，{1}", index + 1, description));
        for (const event of ['mouseenter', 'focus', 'click']) cell.addEventListener(event, () => { entityTip.textContent = description; });
        entityGrid.append(cell);
      });
      if (!ranked.all.length) entityTip.textContent = ranked.ready ? t("当前没有可展示的项目。") : t("尚无统计数据。");
    }
    rankings.replaceChildren();
    for (const [title, entries] of [[t("最常用{0} · 前 5", kind === 'plugins' ? t("插件") : ' Skill'), rankingView.top], [t("未观测到使用 · 最多 5 项"), rankingView.unused]]) {
      const section = node('section'); section.append(node('h3', title));
      const list = node('ol', undefined, 'activity-ranking');
      for (const entry of entries) {
        const item = node('li'), badge = node('span', entry.name.slice(0, 2).toUpperCase(), 'activity-avatar'), copy = node('div');
        copy.append(node('strong', entry.name), node('span', entry.detail, 'ranking-detail'));
        item.append(badge, copy, node('span', t("{0} 次", entry.total), 'ranking-count')); list.append(item);
      }
      if (!entries.length) section.append(node('p', !view.ready ? t("统计暂不可读取，不将失败当作零。") : adopting && !usage?.coverage?.from ? t("尚未收到采用记录，暂不生成排名。") : calling && !usage?.coverage?.from ? t("尚未收到插件调用记录。") : view.ready ? t("当前范围没有符合条件的项目。") : t("尚无统计，不将未知当作零。"), 'activity-note')); else section.append(list);
      rankings.append(section);
    }
    note.textContent = t("{0} {1}不代表成功执行次数。零值仅表示该年份与已查询期间交集内未观测到信号，不代表从未使用。{2}", kind === 'plugins' ? t("插件按所属 Skill 信号汇总，尚不包含插件工具调用；未核实安装的缓存不进入零使用列表。") : t("Skill 按文件实例统计；同名副本保留来源区别。"), label, view.excluded ? t(" {0} 条时间或归属不明的信号未进入热力图。", view.excluded) : '');
    if (adopting && !usage?.coverage?.from && view.ready) entityTip.textContent = t("尚未收到 record_skill_use 记录；启用工具不会自动回填历史使用量。");
    if (calling) { note.textContent = t("独立统计插件工具调用尝试，不与 Skill 采用相加；失败的调用也计一次。由调用方主动记录，按记录时间统计，不是宿主自动监听。只展示有记录的插件；缺失记录不代表从未调用。"); if (!view.ready) caption.textContent = t("插件调用记录暂不可读取。"); else if (!usage.coverage.from) caption.textContent = t("尚未收到插件工具调用记录；启用接口不会自动回填。"); }
    if (adopting) note.textContent = t("{0} 数据由助手主动记录，不是宿主独立验证；未接入记录约定的客户端可能漏记。记录开始前不补造数据，旧推断数据不混入采用次数。", kind === 'plugins' ? t("插件汇总所属 Skill 的采用次数，不含插件工具调用。") : t("每次采用分别计数，同一对话重复采用不合并。"));
  }
  const update = inventory => { current = inventory; render(); };
  update.setLocale = next => {
    t = translator(next);
    pluginButton.textContent = t('插件');
    tabs.setAttribute('aria-label', t('活动类型'));
    yearSelect.setAttribute('aria-label', t('活动年份'));
    for (const [input, key] of [[dateFrom,'开始日期'],[dateTo,'结束日期']]) {
      input.setAttribute('aria-label', t(key));
      input.parentNode.firstChild.textContent = t(key);
    }
    legend.children[0].textContent = t('少');
    legend.children[6].textContent = t('多');
    legend.children[7].textContent = t('斜线：无覆盖 / 未查询');
    title.textContent = t(metric === 'calls' ? '插件工具调用' : 'Skill工具调用');
    tooltip.textContent = t('将鼠标移到日期上，或用键盘选择日期查看使用量。');
    render();
  };
  return update;
}
