import { lstat, readFile, mkdir, writeFile, rename, unlink } from 'node:fs/promises';
import { dataFile } from './data-path.mjs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { acquireAdoptionLock } from './adoption-lock.mjs';

const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{16,80}$/.test(value);
const normalize = value => value.replaceAll('\\', '/').replace(/\/$/, '').toLowerCase();
export class Adoptions {
  constructor(file = dataFile('adoptions.json')) { this.file = file; }
  async read() {
    try {
      const info = await lstat(this.file);
      if (!info.isFile() || info.isSymbolicLink() || info.size > 32 * 1024 * 1024) throw new Error('采用记录文件类型或容量无效');
      const state = JSON.parse(await readFile(this.file, 'utf8'));
      if (state.version !== 1 || !state.batches || !state.catalog || typeof state.batches !== 'object' || typeof state.catalog !== 'object' || Array.isArray(state.batches) || Array.isArray(state.catalog)) throw new Error('采用记录格式无效');
      for (const [id, batch] of Object.entries(state.batches)) {
        if (!validId(id) || !Number.isFinite(Date.parse(batch.at)) || !Array.isArray(batch.skills) || !batch.skills.length || batch.skills.length > 32 || batch.skills.some(s => !state.catalog[s] || state.catalog[s].id !== s || typeof state.catalog[s].name !== 'string')) throw new Error('采用记录损坏，原文件保留');
        if (batch.requestHash !== undefined && (typeof batch.requestHash !== 'string' || !/^[a-f0-9]{64}$/.test(batch.requestHash))) throw new Error('采用请求摘要无效，原文件保留');
      }
      return state;
    } catch (error) { if (error.code === 'ENOENT') return { version: 1, batches: {}, catalog: {} }; throw error; }
  }
  async record({ id, skills: references }, inventory) {
    if (!validId(id) || !Array.isArray(references) || !references.length || references.length > 32 || references.some(r => typeof r !== 'string' || !r || r.length > 1024)) throw new Error('记录参数无效');
    const requestHash = createHash('sha256').update(JSON.stringify(references)).digest('hex');
    const existingRequest = state => {
      const batch = Object.hasOwn(state.batches, id) && state.batches[id];
      if (!batch?.requestHash) return false; // Older records did not retain request identity.
      if (batch.requestHash !== requestHash) throw new Error('同一批次 ID 内容不同，拒绝覆盖');
      return true;
    };
    if (existingRequest(await this.read())) return;
    const directory = path.dirname(this.file);
    await mkdir(directory, { recursive: true });
    if ((await lstat(directory)).isSymbolicLink()) throw new Error('记录目录不能是链接');
    const lockPath = `${this.file}.lock`, temporary = `${this.file}.${randomUUID()}.tmp`;
    const release = await acquireAdoptionLock(lockPath);
    try {
      const state = await this.read();
      if (existingRequest(state)) return;
      const available = typeof inventory === 'function' ? await inventory() : inventory;
      const resolved = references.map(reference => {
        const matches = available.filter(s => s.id === reference || s.name === reference || (s.owner && `${s.owner.directory || s.owner.name}:${s.name}` === reference) || (s.path && normalize(s.path) === normalize(reference)));
        if (matches.length !== 1) throw new Error(`技能未唯一匹配：${reference}；请使用准确 SKILL.md 路径`);
        return matches[0];
      });
      const ids = resolved.map(s => s.id);
      if (Object.hasOwn(state.batches, id)) {
        if (JSON.stringify(state.batches[id].skills) !== JSON.stringify(ids)) throw new Error('同一批次 ID 内容不同，拒绝覆盖');
        return; // Idempotent retry; repeated skill IDs within a new batch are kept.
      }
      for (const s of resolved) state.catalog[s.id] = { id: s.id, name: s.name, source: s.source, fingerprint: s.fingerprint, owner: s.owner ? { name: s.owner.name, directory: s.owner.directory, marketplace: s.owner.marketplace, version: s.owner.version } : null };
      state.batches[id] = { at: new Date().toISOString(), skills: ids, requestHash };
      const serialized = JSON.stringify(state);
      if (Buffer.byteLength(serialized) > 32 * 1024 * 1024) throw new Error('采用记录达到容量限制，原文件保留');
      await writeFile(temporary, serialized, { flag: 'wx', mode: 0o600 });
      await rename(temporary, this.file);
    } finally { await unlink(temporary).catch(() => {}); await release(); }
  }
  async summary(period = {}) {
    const state = await this.read();
    const from = period.from ? Date.parse(period.from) : -Infinity, to = period.to ? Date.parse(period.to) : Infinity;
    if (Number.isNaN(from) || Number.isNaN(to) || from >= to) throw new Error('采用统计期间无效');
    const timeZone = period.timeZone || 'UTC';
    const format = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
    const days = new Map(); let total = 0;
    const all = Object.values(state.batches), earliest = all.map(b => b.at).sort()[0] || null;
    for (const batch of all) {
      const time = Date.parse(batch.at); if (time < from || time >= to) continue;
      const parts = Object.fromEntries(format.formatToParts(new Date(batch.at)).map(p => [p.type, p.value]));
      const date = `${parts.year}-${parts.month}-${parts.day}`;
      if (!days.has(date)) days.set(date, new Map());
      for (const id of batch.skills) { const entries = days.get(date); entries.set(id, (entries.get(id) || 0) + 1); total++; }
    }
    return { total, catalog: Object.values(state.catalog), activity: { timeZone, excluded: 0, uncertainIds: [], days: [...days].sort(([a], [b]) => a.localeCompare(b)).map(([date, entries]) => ({date, entries:[...entries].map(([id, adoptions]) => ({id, adoptions, explicit:0, reads:0}))})) }, period: {from:period.from || null,to:period.to || null}, coverage: {from:earliest,to:new Date().toISOString(),pendingBytes:0,issues:[]}, limits:['助手主动记录的采用次数，不是宿主独立确认的执行次数。', '开始记录以前及未接入记录约定的客户端不可追溯。'] };
  }
}
