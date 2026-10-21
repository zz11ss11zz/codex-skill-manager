import { lstat, readFile, mkdir, open, writeFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export class SkillNotes {
  constructor(file = fileURLToPath(new URL('../.local/skill-notes.json', import.meta.url))) { this.file = file; }
  async read() {
    try {
      const info = await lstat(this.file);
      if (!info.isFile() || info.isSymbolicLink() || info.size > 4 * 1024 * 1024) throw new Error('备注文件类型或大小无效');
      const state = JSON.parse(await readFile(this.file, 'utf8'));
      if (state.version !== 1 || !state.entries || typeof state.entries !== 'object' || Array.isArray(state.entries)) throw new Error('备注格式不受支持');
      for (const [id, entry] of Object.entries(state.entries)) {
        if (!hash(id) || !hash(entry.fingerprint) || typeof entry.note !== 'string' || entry.note.length > 1000 || typeof entry.retain !== 'boolean' || !Number.isSafeInteger(entry.revision) || entry.revision < 1) throw new Error('备注文件损坏，保留原文件后检查');
      }
      return state;
    } catch (error) { if (error.code === 'ENOENT') return { version: 1, entries: {} }; throw error; }
  }
  async save({ id, fingerprint, note, retain, expectedRevision }) {
    if (!hash(id) || !hash(fingerprint) || typeof note !== 'string' || note.length > 1000 || typeof retain !== 'boolean' || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new Error('备注参数无效');
    const directory = path.dirname(this.file);
    await mkdir(directory, { recursive: true });
    if ((await lstat(directory)).isSymbolicLink()) throw new Error('备注目录不能为链接');
    const lockPath = `${this.file}.lock`, temporary = `${this.file}.${randomUUID()}.tmp`;
    const lock = await open(lockPath, 'wx');
    try {
      const state = await this.read();
      if ((state.entries[id]?.revision || 0) !== expectedRevision) throw new Error('备注已被其他页面更新，请重新扫描后再编辑');
      const entry = { fingerprint, note, retain, revision: expectedRevision + 1, updatedAt: new Date().toISOString() };
      state.entries[id] = entry;
      const serialized = JSON.stringify(state);
      if (Buffer.byteLength(serialized) > 4 * 1024 * 1024) throw new Error('备注超过容量限制，原文件保留');
      await writeFile(temporary, serialized, { flag: 'wx', mode: 0o600 });
      await rename(temporary, this.file);
      return entry;
    } finally { await unlink(temporary).catch(() => {}); await lock.close(); await unlink(lockPath); }
  }
}
