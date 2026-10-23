// Summarize all indexed signals before the evidence list is truncated.
export function summarizeActivity(events, timeZone = 'UTC') {
  const format = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const days = new Map(), uncertain = new Set();
  let excluded = 0;
  for (const event of events) {
    if (event.resolution !== 'resolved' || !event.timestamp || !Number.isFinite(Date.parse(event.timestamp))) {
      excluded++;
      for (const id of event.candidateIds || []) uncertain.add(id);
      continue;
    }
    const parts = Object.fromEntries(format.formatToParts(new Date(event.timestamp)).map(p => [p.type, p.value]));
    const date = `${parts.year}-${parts.month}-${parts.day}`;
    if (!days.has(date)) days.set(date, new Map());
    const id = event.candidateIds[0], entries = days.get(date);
    if (!entries.has(id)) entries.set(id, { id, explicit: 0, reads: 0 });
    if (event.kind === 'explicit-marker') entries.get(id).explicit++;
    if (event.kind === 'read-request') entries.get(id).reads++;
  }
  return { timeZone, excluded, uncertainIds: [...uncertain], days: [...days].sort(([a], [b]) => a.localeCompare(b)).map(([date, entries]) => ({ date, entries: [...entries.values()] })) };
}

export function activityCoverage(usage, year, range = {}, now = Date.now()) {
  const c = usage?.coverage;
  const lower = Math.max(Date.parse(c?.from), usage?.period?.from ? Date.parse(usage.period.from) : -Infinity);
  const upper = Math.min(Date.parse(c?.to), now, usage?.period?.to ? Date.parse(usage.period.to) - 1 : Infinity);
  const formatter = new Intl.DateTimeFormat('en-CA', {timeZone:usage?.activity?.timeZone || 'UTC',year:'numeric',month:'2-digit',day:'2-digit'});
  const date = time => {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(time)).map(p=>[p.type,p.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  };
  const from = range.from || `${year}-01-01`, to = range.to || `${year}-12-31`;
  const valid = Boolean(usage?.activity) && Number.isFinite(lower) && Number.isFinite(upper) && lower <= upper;
  const start = valid ? date(lower) : null, end = valid ? date(upper) : null;
  const effectiveFrom = start && (start > from ? start : from), effectiveTo = end && (end < to ? end : to);
  const hasOverlap = Boolean(valid && effectiveFrom <= effectiveTo);
  const incomplete = !usage?.activity || Boolean(c?.pendingBytes || c?.issues?.length || c?.malformedLines || c?.oversizedLines);
  return {from,to,start,end,effectiveFrom:hasOverlap ? effectiveFrom : null,effectiveTo:hasOverlap ? effectiveTo : null,
    hasOverlap,incomplete,partial:!hasOverlap || incomplete || effectiveFrom !== from || effectiveTo !== to};
}

export function activityView(inventory, kind, year, metric = 'reads', range = {}) {
  const activity = inventory.usage?.activity;
  const entities = new Map(), instanceEntity = new Map();
  const uncertain = new Set(activity?.uncertainIds || []);
  const registry = inventory.pluginRegistry?.plugins || [];
  if (metric === 'calls' && kind === 'plugins') for (const plugin of inventory.usage?.catalog || []) {
    entities.set(plugin.id,{...plugin,total:0,allSignals:0,eligibleZero:true,uncertain:false});
    instanceEntity.set(plugin.id,plugin.id);
  }
  for (const skill of metric === 'calls' ? [] : inventory.skills) {
    const owner = skill.owner;
    const pluginId = owner ? `${owner.directory || owner.name}@${owner.marketplace}` : null;
    const installed = !skill.historical && (!owner || registry.some(p => p.id === pluginId && p.version === owner.version));
    if (kind === 'plugins' && !owner) continue;
    const id = kind === 'plugins' ? pluginId : skill.id;
    if (!entities.has(id)) entities.set(id, { id, name: kind === 'plugins' ? owner.name : skill.name, detail: kind === 'plugins' ? owner.marketplace : (owner ? `${owner.name} / ${owner.version}` : skill.source), total: 0, allSignals: 0, eligibleZero: false, uncertain: false });
    const entity = entities.get(id);
    entity.eligibleZero ||= installed;
    entity.uncertain ||= uncertain.has(skill.id);
    instanceEntity.set(skill.id, id);
  }
  const days = new Map();
  for (const day of activity?.days || []) {
    if (!day.date.startsWith(`${year}-`)) continue;
    if ((range.from && day.date < range.from) || (range.to && day.date > range.to)) continue;
    let total = 0;
    for (const entry of day.entries) {
      const entity = entities.get(instanceEntity.get(entry.id));
      if (!entity) continue;
      const count = metric === 'calls' ? (entry.calls || 0) : metric === 'adoptions' ? (entry.adoptions || 0) : metric === 'explicit' ? (entry.explicit || 0) : (entry.reads || 0);
      entity.total += count; total += count;
      entity.allSignals += (entry.explicit || 0) + (entry.reads || 0) + (entry.adoptions || 0) + (entry.calls || 0);
    }
    days.set(day.date, total);
  }
  const order = (a, b) => b.total - a.total || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  const all = [...entities.values()].sort(order);
  const ready = Boolean(activity);
  const coverage = activityCoverage(inventory.usage, year, range);
  const covered = coverage.hasOverlap && !coverage.incomplete;
  for (const entry of all) entry.unknown = !entry.total && (!covered || entry.uncertain);
  return { ready, coverage, days, all: ready ? all : [], total: all.reduce((n, e) => n + e.total, 0), top: ready ? all.filter(e => e.total > 0).slice(0, 5) : [], unused: covered ? all.filter(e => e.allSignals === 0 && e.eligibleZero && !e.uncertain).slice(0, 5) : [], excluded: activity?.excluded || 0 };
}

export function calendarDays(year) {
  const start = new Date(Date.UTC(year, 0, 1)), end = new Date(Date.UTC(year + 1, 0, 1));
  const result = Array.from({ length: (start.getUTCDay() + 6) % 7 }, () => null);
  for (let date = start; date < end; date = new Date(date.getTime() + 86400000)) result.push(date.toISOString().slice(0, 10));
  while (result.length % 7) result.push(null);
  return result;
}
