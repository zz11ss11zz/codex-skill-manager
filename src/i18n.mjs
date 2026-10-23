export function resolveLocale(host, fallback = 'en') {
  const value = typeof host === 'string' && host.trim() ? host : fallback;
  return /^zh(?:[-_]|$)/i.test(value) ? 'zh' : 'en';
}
export const english = {
  "插件工具调用": "Plugin tool calls",
  "活动类型": "Activity type", "插件": "Plugins", "活动年份": "Activity year",
  "将鼠标移到日期上，或用键盘选择日期查看使用量。": "Hover over a date or select it with the keyboard to view activity.",
  "少": "Less", "多": "More", "斜线：无覆盖 / 未查询": "Hatched: no coverage / not queried",
  "开始日期": "Start date", "结束日期": "End date", "Skill 采用次数": "Skill adoptions",
  "{0}（已不在当前清单）": "{0} (no longer in the current inventory)",
  "{0} 年": "{0}", "工具调用尝试": "tool call attempts", "采用": "adoptions",
  "读取请求": "read requests", "显式标记": "explicit mentions",
  "采用记录暂不可读取，请重新打开管理器。": "Adoption records are unavailable. Reopen the manager.",
  "插件调用记录暂不可读取。": "Plugin call records are unavailable.",
  "{0}月": "Month {0}", "{0} 年每日{1}": "Daily {1} in {0}",
  "无覆盖或未查询，不能判断使用量": "No coverage or query; activity is unknown",
  "{0} 次{1}": "{0} {1}", "{0}使用量排序": "{0} activity ranking",
  "悬停或聚焦格子查看名称与次数。": "Hover over or focus a cell to see its name and count.",
  "请选择 {0} 年内有效的起止日期，开始日期不得晚于结束日期。": "Choose valid dates within {0}; the start must not be after the end.",
  "统计覆盖 {0} 至 {1}{2}": "Coverage: {0} to {1}{2}",
  "（数据不完整）": " (incomplete data)", "所选日期无统计覆盖": "No coverage for the selected dates",
  "{0} 至 {1} · {2} · 已记录 {3} 次{4} · 每格一项，从左到右、从上到下按次数降序 · 颜色越深次数越多": "{0} to {1} · {2} · {3} recorded {4} · One item per cell, descending left to right and top to bottom · Darker means more",
  "无覆盖或归属不明，不能判断使用量": "Coverage or attribution unknown; activity cannot be determined",
  "{0} 次{1}{2}": "{0} {1}{2}", "（已覆盖期间无记录）": " (no records in the covered period)",
  "第 {0} 名，{1}": "Rank {0}, {1}", "当前没有可展示的项目。": "No items to display.",
  "尚无统计数据。": "No activity data yet.", "最常用{0} · 前 5": "Most used {0} · Top 5",
  "未观测到使用 · 最多 5 项": "No observed usage · Up to 5", "{0} 次": "{0} events",
  "统计暂不可读取，不将失败当作零。": "Statistics unavailable; an error does not mean zero usage.",
  "尚未收到采用记录，暂不生成排名。": "No adoption records received; rankings are unavailable.",
  "尚未收到插件调用记录。": "No plugin call records received.",
  "当前范围没有符合条件的项目。": "No matching items in this period.",
  "尚无统计，不将未知当作零。": "No statistics yet; unknown is not zero.",
  "{0} {1}不代表成功执行次数。零值仅表示该年份与已查询期间交集内未观测到信号，不代表从未使用。{2}": "{0} {1} do not measure successful execution. Zero means no observed signals in the intersection of this year and the queried period, not never used.{2}",
  "插件按所属 Skill 信号汇总，尚不包含插件工具调用；未核实安装的缓存不进入零使用列表。": "Plugins aggregate their Skill signals, excluding plugin tool calls. Unverified cached plugins are excluded from zero-use lists.",
  "Skill 按文件实例统计；同名副本保留来源区别。": "Skills are counted by file instance; copies with the same name retain their sources.",
  " {0} 条时间或归属不明的信号未进入热力图。": " {0} signals with unknown time or attribution are excluded.",
  "尚未收到 record_skill_use 记录；启用工具不会自动回填历史使用量。": "No record_skill_use records received; enabling tools does not backfill activity.",
  "独立统计插件工具调用尝试，不与 Skill 采用相加；失败的调用也计一次。由调用方主动记录，按记录时间统计，不是宿主自动监听。只展示有记录的插件；缺失记录不代表从未调用。": "Plugin tool call attempts are counted separately from Skill adoptions, including failed attempts. Callers explicitly record events at recording time; the host does not monitor calls automatically. Only recorded plugins appear; missing records do not mean never called.",
  "尚未收到插件工具调用记录；启用接口不会自动回填。": "No plugin tool call records received; enabling the interface does not backfill history.",
  "{0} 数据由助手主动记录，不是宿主独立验证；未接入记录约定的客户端可能漏记。记录开始前不补造数据，旧推断数据不混入采用次数。": "{0} Records are submitted by the assistant, not independently verified by the host. Clients without the recording convention may miss events. History is not backfilled and inferred signals are excluded.",
  "插件汇总所属 Skill 的采用次数，不含插件工具调用。": "Plugins aggregate their Skill adoptions, excluding plugin tool calls.",
  "每次采用分别计数，同一对话重复采用不合并。": "Each adoption counts separately, including repeats within a conversation.",
  "统计数据暂不可读取，请重新打开能力管理器。": "Statistics are unavailable. Reopen Skill Manager.",
  "统计刷新失败，暂时保留上次结果；重新进入面板时会重试。": "Refresh failed. Previous results are retained; reopening the panel will retry.",
  "管理器连接未完成，请重新打开面板。": "Connection failed. Reopen the panel.",
  "能力管理器": "Skill Manager", "查看本地技能文件与来源证据。": "Explore local skills and their source evidence.",
  "使用活动热力图与排名": "Activity heatmaps and rankings", "正在读取统计…": "Loading statistics…"
};
export function translator(locale) {
  return (key, ...values) => (locale === 'en' ? english[key] ?? key : key)
    .replace(/\{(\d+)\}/g, (_, i) => String(values[Number(i)] ?? ''));
}
