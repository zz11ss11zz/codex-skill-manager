import { open, lstat, realpath, readdir, mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { UsageParser, aggregateUsage } from './usage.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const MAX_LINE = 4 * 1024 * 1024;
const BUDGET = 32 * 1024 * 1024;
const inside = (root, file) => { const rel = path.relative(root, file); return rel === '' || (!rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel)); };
const identity = info => `${info.dev}:${info.ino}:${info.birthtimeMs}`;
async function bytesAt(handle, start, count) {
  const buffer = Buffer.alloc(count);
  const { bytesRead } = await handle.read(buffer, 0, count, start);
  return buffer.subarray(0, bytesRead);
}
function emptyState(file) {
  return { path: file, offset: 0, line: 0, parser: { session: null, turn: null, cwd: null }, events: [], records: 0, malformed: 0, oversized: 0, firstTimestamp: null, lastTimestamp: null, discarding: false };
}

export async function readUsageFile(file, previous = null, { maxBytes = BUDGET, maxLineBytes = MAX_LINE } = {}) {
  if (maxBytes <= maxLineBytes) throw new Error('读取预算必须大于单行限制');
  const info = await lstat(file);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error('日志必须为普通文件');
  const handle = await open(file, 'r');
  try {
    const initial = await handle.stat();
    let state = previous ? structuredClone(previous) : emptyState(file), reset = false;
    if (previous) {
      const changed = state.path !== file || state.fileIdentity !== identity(initial) || initial.size < state.offset ||
        (initial.size === state.observedSize && initial.mtimeMs !== state.mtimeMs) ||
        digest(await bytesAt(handle, 0, state.prefixLength)) !== state.prefixHash ||
        digest(await bytesAt(handle, state.anchorStart, state.offset - state.anchorStart)) !== state.anchorHash;
      if (changed) { state = emptyState(file); reset = true; }
    }
    const parser = new UsageParser();
    Object.assign(parser, state.parser);
    const buffer = await bytesAt(handle, state.offset, Math.min(maxBytes, Math.max(0, initial.size - state.offset)));
    let cursor = 0;
    while (cursor < buffer.length) {
      const newline = buffer.indexOf(10, cursor);
      if (newline < 0) {
        if (state.discarding || buffer.length - cursor > maxLineBytes) {
          if (!state.discarding) state.oversized++;
          state.discarding = true;
          state.offset += buffer.length - cursor;
        }
        break; // A short incomplete line is reread next time; no raw tail is persisted.
      }
      const length = newline - cursor;
      state.line++;
      state.offset += length + 1;
      if (state.discarding) state.discarding = false;
      else if (length > maxLineBytes) state.oversized++;
      else {
        try {
          const record = JSON.parse(buffer.subarray(cursor, newline).toString('utf8').replace(/^\uFEFF/, ''));
          state.records++;
          if (typeof record.timestamp === 'string' && Number.isFinite(Date.parse(record.timestamp))) {
            const timestamp = new Date(record.timestamp).toISOString();
            if (!state.firstTimestamp || timestamp < state.firstTimestamp) state.firstTimestamp = timestamp;
            if (!state.lastTimestamp || timestamp > state.lastTimestamp) state.lastTimestamp = timestamp;
          }
          state.events.push(...parser.accept(record, file, state.line));
        } catch { state.malformed++; }
      }
      cursor = newline + 1;
    }
    const after = await handle.stat();
    if (after.size < initial.size || (after.size === initial.size && after.mtimeMs !== initial.mtimeMs)) throw new Error('读取期间日志发生替换，请重试');
    state.parser = { session: parser.session, turn: parser.turn, cwd: parser.cwd };
    state.fileIdentity = identity(initial);
    state.observedSize = initial.size;
    state.mtimeMs = initial.mtimeMs;
    state.prefixLength = Math.min(state.offset, 4096);
    state.prefixHash = digest(await bytesAt(handle, 0, state.prefixLength));
    state.anchorStart = Math.max(0, state.offset - 4096);
    state.anchorHash = digest(await bytesAt(handle, state.anchorStart, state.offset - state.anchorStart));
    return { state, reset, bytesRead: buffer.length, pendingBytes: Math.max(0, initial.size - state.offset) };
  } finally { await handle.close(); }
}

async function discover(roots) {
  const files = [], issues = [];
  async function walk(dir, boundary, depth) {
    try {
      if (depth > 6 || (await lstat(dir)).isSymbolicLink()) { issues.push({ path: dir, reason: '跳过链接或过深目录' }); return; }
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const target = path.join(dir, entry.name);
        if (entry.isSymbolicLink()) { issues.push({ path: target, reason: '跳过日志符号链接' }); continue; }
        if (entry.isDirectory()) await walk(target, boundary, depth + 1);
        else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
          if (!inside(boundary, await realpath(target))) { issues.push({ path: target, reason: '路径超出日志根目录' }); continue; }
          const info = await lstat(target);
          files.push({ path: target, size: info.size, mtimeMs: info.mtimeMs });
        }
      }
    } catch (error) { issues.push({ path: dir, reason: error.code === 'ENOENT' ? '日志目录不存在' : '日志目录无法读取' }); }
  }
  for (const root of roots) await walk(root, await realpath(root).catch(() => root), 0);
  return { files: [...new Map(files.map(f => [f.path, f])).values()].sort((a, b) => b.mtimeMs - a.mtimeMs || a.path.localeCompare(b.path)), issues };
}

export function defaultUsageOptions() {
  const home = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  return { roots: [path.join(home, 'sessions'), path.join(home, 'archived_sessions')], stateFile: fileURLToPath(new URL('../.local/usage-index.json', import.meta.url)) };
}

export class UsageIndex {
  constructor(options = defaultUsageOptions()) { this.options = options; }
  async refresh(skills) {
    const { roots, stateFile } = this.options;
    const directory = path.dirname(stateFile);
    await mkdir(directory, { recursive: true });
    if ((await lstat(directory)).isSymbolicLink()) throw new Error('索引目录不能为符号链接');
    const lockFile = `${stateFile}.lock`;
    let lock;
    try { lock = await open(lockFile, 'wx'); } catch (error) { if (error.code === 'EEXIST') throw new Error('已有导入占用本地索引；若上次异常退出，请确认没有导入进程后移除锁文件'); throw error; }
    const temporary = `${stateFile}.${randomUUID()}.tmp`;
    try {
      let snapshot = { version: 1, files: {} };
      try {
        const info = await lstat(stateFile);
        if (!info.isFile() || info.isSymbolicLink() || info.size > 64 * 1024 * 1024) throw new Error('本地索引类型或大小无效');
        snapshot = JSON.parse(await readFile(stateFile, 'utf8'));
        if (snapshot.version !== 1 || !snapshot.files || typeof snapshot.files !== 'object') throw new Error('索引格式不受支持');
        for (const [file, s] of Object.entries(snapshot.files)) if (s.path !== file || !Number.isSafeInteger(s.offset) || s.offset < 0 || !Array.isArray(s.events) || !s.parser || !Number.isSafeInteger(s.prefixLength) || !Number.isSafeInteger(s.anchorStart) || s.anchorStart < 0 || s.anchorStart > s.offset || s.offset - s.anchorStart > 4096 || s.prefixLength < 0 || s.prefixLength > 4096) throw new Error('本地索引损坏，请保留文件后重新建立索引');
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
      const discovered = await discover(roots), next = {}, issues = [...discovered.issues];
      let budget = this.options.maxBytes || BUDGET, bytesRead = 0, resets = 0;
      const maxLineBytes = this.options.maxLineBytes || MAX_LINE;
      for (const file of discovered.files) {
        const previous = snapshot.files[file.path];
        if (budget <= maxLineBytes) { if (previous) next[file.path] = previous; continue; }
        try {
          const result = await readUsageFile(file.path, previous, { maxBytes: budget, maxLineBytes });
          next[file.path] = result.state;
          budget -= result.bytesRead;
          bytesRead += result.bytesRead;
          if (result.reset) resets++;
        } catch { issues.push({ path: file.path, reason: '日志读取失败；该文件本次不计入统计' }); }
      }
      const states = Object.values(next), events = states.flatMap(s => s.events);
      const usage = aggregateUsage(events, skills);
      const first = states.map(s => s.firstTimestamp).filter(Boolean).sort();
      const last = states.map(s => s.lastTimestamp).filter(Boolean).sort();
      const pendingBytes = discovered.files.reduce((sum, f) => sum + Math.max(0, f.size - (next[f.path]?.offset || 0)), 0);
      const coverage = { checkedAt: new Date().toISOString(), roots, discoveredFiles: discovered.files.length, indexedFiles: states.length, bytesRead, pendingBytes, records: states.reduce((n, s) => n + s.records, 0), malformedLines: states.reduce((n, s) => n + s.malformed, 0), oversizedLines: states.reduce((n, s) => n + s.oversized, 0), from: first[0] || null, to: last.at(-1) || null, resets, issues };
      const serialized = JSON.stringify({ version: 1, files: next });
      if (Buffer.byteLength(serialized) > 64 * 1024 * 1024) throw new Error('本地索引达到 64 MiB 限制，保留此前索引');
      await writeFile(temporary, serialized, { flag: 'wx', mode: 0o600 });
      await rename(temporary, stateFile);
      return { ...usage, events: usage.events.slice(-100), totalEvents: usage.events.length, coverage, limits: [...usage.limits, '每次最多读取 32 MiB；待处理字节可能包含尚未写完的末行。重复点击可继续导入。', '按追加日志处理，检测截断、文件身份和首尾边界变化；不对已读中段作完整校验。', '界面仅返回最近导入顺序的 100 条证据；计数包含已索引全部信号。', '索引只保存信号、定位与读到的位置，不保存聊天正文。'] };
    } finally { await unlink(temporary).catch(() => {}); await lock.close(); await unlink(lockFile); }
  }
}
