import { createHash } from 'node:crypto';
import path from 'node:path';
import { parse } from 'acorn';

const hash = value => createHash('sha256').update(value).digest('hex');
const stringOrNull = value => typeof value === 'string' && value.length ? value : null;
const normalizePath = value => /^[A-Za-z]:[\\/]/.test(value) ? path.win32.normalize(value).replaceAll('\\', '/').toLowerCase() : path.posix.normalize(value);
const literal = node => node?.type === 'Literal' && typeof node.value === 'string' ? node.value : null;
function commandObject(node) {
  if (node?.type !== 'ObjectExpression' || node.properties.some(p => p.type !== 'Property' || p.computed || p.kind !== 'init')) return null;
  const fields = Object.fromEntries(node.properties.map(p => [p.key.name || p.key.value, literal(p.value)]));
  return fields.cmd ? { cmd: fields.cmd, cwd: fields.workdir } : null;
}

// Inspect only unconditional top-level calls. Never evaluate logged JavaScript.
export function readCommands(payload) {
  if (payload.type === 'function_call' && /(?:^|[._])exec_command$/.test(payload.name || '')) {
    try { const args = JSON.parse(payload.arguments); return typeof args.cmd === 'string' ? [{ cmd: args.cmd, cwd: args.workdir }] : []; } catch { return []; }
  }
  if (payload.type !== 'custom_tool_call' || !/(?:^|[._])exec$/.test(payload.name || '') || typeof payload.input !== 'string') return [];
  let tree;
  try { tree = parse(payload.input, { ecmaVersion: 'latest', sourceType: 'module' }); } catch { return []; }
  const commands = [];
  function visit(node) {
    if (!node) return;
    if (node.type === 'AwaitExpression') return visit(node.argument);
    if (node.type === 'ArrayExpression') return node.elements.forEach(visit);
    if (node.type !== 'CallExpression') return;
    const member = node.callee;
    if (member.type === 'MemberExpression' && !member.computed && member.object.type === 'Identifier' && member.object.name === 'tools' && member.property.name === 'exec_command') {
      const command = commandObject(node.arguments[0]);
      if (command) commands.push(command);
    } else if (member.type === 'MemberExpression' && !member.computed && member.object.name === 'Promise' && ['all', 'allSettled'].includes(member.property.name)) {
      node.arguments.forEach(visit);
    } else if (member.type === 'Identifier' && ['text', 'notify'].includes(member.name)) node.arguments.forEach(visit);
  }
  for (const node of tree.body) {
    if (node.type === 'ExpressionStatement') visit(node.expression);
    if (node.type === 'VariableDeclaration') node.declarations.forEach(d => visit(d.init));
  }
  return commands;
}

export function skillReadPaths(command, cwd) {
  if (/[\r\n;|&<>`$*?]/.test(command)) return [];
  const tokens = command.match(/"[^"]*"|'[^']*'|[^\s"']+/g) || [];
  if (tokens.map(s => s).join(' ').replace(/\s+/g, ' ').trim() !== command.replace(/\s+/g, ' ').trim()) return [];
  const parts = tokens.map(t => /^['"]/.test(t) ? t.slice(1, -1) : t);
  const executable = parts.shift()?.toLowerCase();
  const files = [];
  if (executable === 'get-content') {
    for (let i = 0; i < parts.length; i++) {
      if (/^-(literalpath|path|raw)$/i.test(parts[i])) continue;
      if (/^-(totalcount|tail)$/i.test(parts[i])) { if (!/^\d+$/.test(parts[++i] || '')) return []; continue; }
      if (parts[i].startsWith('-')) return [];
      files.push(parts[i]);
    }
  } else if (executable === 'cat') {
    if (parts.some(p => p.startsWith('-'))) return [];
    files.push(...parts);
  } else return [];
  return files.filter(file => /(?:^|[\\/])SKILL\.md$/i.test(file)).flatMap(file => {
    const windows = /^[A-Za-z]:[\\/]/.test(file) || /^[A-Za-z]:[\\/]/.test(cwd || '');
    const api = windows ? path.win32 : path.posix;
    if (!api.isAbsolute(file) && !cwd) return [];
    return [normalizePath(api.resolve(cwd || api.dirname(file), file))];
  });
}

function markers(text) {
  if (/^\s*<(?:environment_context|codex_internal_context|send_user_message_question_reply|permissions instructions)\b/.test(text) || text.startsWith('The following is the Codex agent history whose request action you are assessing.')) return [];
  // Quoted examples are not invocation evidence. Plain markers still indicate intent only.
  const plain = text.replace(/```[\s\S]*?(?:```|$)/g, '').replace(/~~~[\s\S]*?(?:~~~|$)/g, '').replace(/`[^`]*`/g, '').replace(/^\s*>.*$/gm, '');
  return [...new Set([...plain.matchAll(/(?:^|[^\w$\\])\$([A-Za-z][A-Za-z0-9_-]*(?::[A-Za-z][A-Za-z0-9_-]*)?)(?![A-Za-z0-9_:-]|\.[A-Za-z0-9_]|\s*=)/g)].map(m => m[1]).filter(name => !/^(?:env:|global:|script:|local:|private:|using:|true$|false$|null$|LASTEXITCODE$)/i.test(name)))];
}

export class UsageParser {
  constructor() { this.session = null; this.turn = null; this.cwd = null; this.excludedSession = false; }
  accept(record, source, line) {
    const p = record?.payload;
    if (!p || typeof p !== 'object') return [];
    if (record.type === 'session_meta') { this.session = stringOrNull(p.id) || stringOrNull(p.session_id); this.cwd = stringOrNull(p.cwd); this.excludedSession = p.source === 'subagent' || Boolean(p.source && typeof p.source === 'object' && p.source.subagent); return []; }
    if (this.excludedSession) return [];
    if (record.type === 'turn_context') { this.turn = stringOrNull(p.turn_id); this.cwd = stringOrNull(p.cwd) || this.cwd; return []; }
    // Nested compacted/replacement histories and event_msg mirrors are deliberately ignored.
    if (record.type !== 'response_item') return [];
    const stableId = stringOrNull(p.id) || stringOrNull(p.call_id);
    const origin = stableId || `${source}:${line}`;
    const time = typeof record.timestamp === 'string' && Number.isFinite(Date.parse(record.timestamp)) ? record.timestamp : null;
    const signals = [];
    if (p.type === 'message' && p.role === 'user' && Array.isArray(p.content)) {
      if (p.content.some(part => typeof part.text === 'string' && part.text.startsWith('The following is the Codex agent history whose request action you are assessing.'))) return [];
      for (const part of p.content) if (part.type === 'input_text' && typeof part.text === 'string') {
        for (const marker of markers(part.text)) signals.push({ kind: 'explicit-marker', reference: marker });
      }
    } else {
      for (const command of readCommands(p)) for (const file of skillReadPaths(command.cmd, command.cwd || this.cwd)) signals.push({ kind: 'read-request', reference: file });
    }
    return [...new Map(signals.map(signal => {
      // Multiple reads of the same skill during a turn are one inferred activation candidate.
      const scope = signal.kind === 'read-request' && this.session && this.turn ? `${this.session}:${this.turn}` : origin;
      const key = hash(`${signal.kind}:${scope}:${signal.reference}`);
      return [key, { key, ...signal, timestamp: time, source, line, itemId: stableId, session: this.session, turn: this.turn, identity: stableId ? 'stable-item' : 'source-line', replayKey: stableId ? hash(`${signal.kind}:${stableId}:${signal.reference}`) : null }];
    })).values()];
  }
}

export function aggregateUsage(events, skills, period = {}) {
  const bound = value => {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error('统计时间必须带时区');
    return Date.parse(value);
  };
  const from = bound(period.from), to = bound(period.to);
  if (from !== null && to !== null && from >= to) throw new Error('开始时间必须早于结束时间');
  // Union aliases before counting: a replay can connect two turn-level groups.
  // This keeps results independent of file/import order.
  const parents = events.map((_, i) => i), aliases = new Map(), accepted = [];
  const root = index => { while (parents[index] !== index) { parents[index] = parents[parents[index]]; index = parents[index]; } return index; };
  events.forEach((event, index) => {
    for (const alias of [`key:${event.key}`, ...(event.replayKey ? [`replay:${event.replayKey}`] : [])]) {
      if (aliases.has(alias)) parents[root(index)] = root(aliases.get(alias));
      else aliases.set(alias, index);
    }
  });
  const groups = new Map();
  events.forEach((event, index) => { const key = root(index); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(event); });
  for (const group of groups.values()) {
    const event = group[0];
    const time = event.timestamp ? Date.parse(event.timestamp) : NaN;
    if ((from !== null || to !== null) && (!Number.isFinite(time) || (from !== null && time < from) || (to !== null && time >= to))) continue;
    const candidates = skills.filter(skill => event.kind === 'read-request' ? normalizePath(skill.path) === event.reference : skill.name === event.reference || (skill.owner && `${skill.owner.directory || skill.owner.name}:${skill.name}` === event.reference));
    const locations = [...new Map(group.map(e => [`${e.source}:${e.line}`, { source: e.source, line: e.line }])).values()];
    accepted.push({ ...event, locations, candidateIds: candidates.map(s => s.id), resolution: candidates.length === 1 ? 'resolved' : candidates.length ? 'ambiguous' : 'unresolved' });
  }
  const counts = {};
  for (const kind of ['explicit-marker', 'read-request']) {
    const group = accepted.filter(e => e.kind === kind);
    counts[kind] = { events: group.length, uniqueReferences: new Set(group.map(e => e.reference)).size, resolvedInstances: new Set(group.filter(e => e.resolution === 'resolved').map(e => e.candidateIds[0])).size };
  }
  return { events: accepted, counts, period: { from: from === null ? null : new Date(from).toISOString(), to: to === null ? null : new Date(to).toISOString() }, limits: ['生成子会话（含审批审查）不计使用信号；来源不明的日志仅按可识别结构过滤。', '过滤已识别的变量语法，裸标记仍可能是讨论或变量，不能作为确定执行次数。', '显式标记仅表示调用意图；可能仍为讨论，不证明执行成功。', '读取请求是推断信号，不证明读取成功或技能实际执行。', '同一会话同一轮的相同路径读取合并；有稳定 ID 的重放去重，无 ID 时只能按来源行去重。', '仅支持独立 Get-Content/cat 和静态 tools.exec_command 调用；动态脚本、条件分支等不推断。', '未解析宿主激活和 Agent 自报，不将其他信号替代它们。', '同名多实例保留歧义；没有观察到信号不代表从未使用。'] };
}
