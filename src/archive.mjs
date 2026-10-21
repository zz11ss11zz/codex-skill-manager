import { readdir, readFile, writeFile, lstat, realpath, mkdir, rename, open, unlink } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { defaultRoots, scanInventory } from './inventory.mjs';

const hash = data => createHash('sha256').update(data).digest('hex');
const exists = file => lstat(file).then(() => true, e => { if (e.code === 'ENOENT') return false; throw e; });
const isChild = (root, target) => path.dirname(path.resolve(target)) === path.resolve(root);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
async function directory(dir) {
  const info = await lstat(dir);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('目录不能是链接或非目录对象');
  return realpath(dir);
}
async function treeSnapshot(root) {
  await directory(root);
  const entries = [];
  let bytes = 0;
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entries.length >= 10000) throw new Error('技能文件数超过 10000，暂不支持归档');
      const file = path.join(dir, entry.name), relative = path.relative(root, file).replaceAll('\\', '/');
      const info = await lstat(file);
      if (info.isSymbolicLink()) throw new Error('技能含链接，暂不支持归档');
      if (info.isDirectory()) { entries.push({ path: relative, type: 'directory' }); await walk(file); }
      else if (info.isFile()) {
        bytes += info.size;
        if (bytes > 50 * 1024 * 1024) throw new Error('技能超过 50 MiB，暂不支持归档');
        const content = await readFile(file);
        if (content.length !== info.size) throw new Error('读取期间文件大小变化，请重新预览');
        entries.push({ path: relative, type: 'file', size: info.size, hash: hash(content) });
      } else throw new Error('技能含特殊文件，暂不支持归档');
    }
  }
  await walk(root);
  entries.sort((a, b) => a.path.localeCompare(b.path));
  return { fingerprint: hash(JSON.stringify(entries)), files: entries.filter(e => e.type === 'file').length, bytes };
}
export async function moveDirectory(source, destination, sourceRoot, destinationRoot) {
  if (process.platform !== 'win32') throw new Error('归档移动目前仅支持已验证的 Windows 环境');
  for (const [target, root] of [[source, sourceRoot], [destination, destinationRoot]]) {
    const rel = path.relative(path.resolve(root), path.resolve(target));
    if (!rel || rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) throw new Error('移动路径超出允许目录');
  }
  await directory(source);
  // Windows directory rename rejects an existing target directory (including empty).
  // Do not use this implementation on POSIX, where empty directories can be replaced.
  await rename(source, destination);
}

export class ArchiveManager {
  constructor({ roots = defaultRoots(), archiveRoot = path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'skill-manager-archive'), move = moveDirectory } = {}) {
    this.roots = roots; this.archiveRoot = path.resolve(archiveRoot); this.move = move; this.plans = new Map();
  }
  original(rootKey, name) {
    if (!['skills', 'agentSkills'].includes(rootKey) || !this.roots[rootKey] || typeof name !== 'string' || name.startsWith('.') || name !== path.basename(name) || /[\\/:]/.test(name)) throw new Error('不支持管理该技能位置');
    const original = path.resolve(this.roots[rootKey], name);
    if (!isChild(this.roots[rootKey], original)) throw new Error('技能路径超出允许根目录');
    return original;
  }
  bucket(id) { if (!UUID.test(id)) throw new Error('归档 ID 无效'); return path.join(this.archiveRoot, id); }
  savePlan(plan) {
    for (const [id, old] of this.plans) if (old.expiresAt < Date.now()) this.plans.delete(id);
    if (this.plans.size >= 20) throw new Error('预览过多，请等待旧预览过期');
    const result = { ...plan, token: randomUUID(), expiresAt: Date.now() + 10 * 60 * 1000 };
    this.plans.set(result.token, result);
    return result;
  }
  cancel(token) { return this.plans.delete(token); }
  async previewArchive(skillId) {
    const inventory = await scanInventory(this.roots), skill = inventory.skills.find(s => s.id === skillId);
    if (!skill || !['用户技能', '用户 .agents 技能'].includes(skill.source)) throw new Error('仅允许归档用户技能，系统和插件内容只读');
    const folder = path.dirname(skill.path);
    const rootKey = ['skills', 'agentSkills'].find(key => this.roots[key] && isChild(this.roots[key], folder));
    const name = path.basename(folder), original = this.original(rootKey, name);
    await directory(this.roots[rootKey]);
    const snapshot = await treeSnapshot(original), id = randomUUID();
    return this.savePlan({ action: 'archive', id, rootKey, name, title: skill.name, original, destination: path.join(this.bucket(id), 'skill'), ...snapshot, impact: '将整个用户技能目录移出扫描根目录并保留可恢复副本；已运行会话可能仍持有旧技能内容。' });
  }
  async record(id) {
    const bucket = this.bucket(id);
    await directory(this.archiveRoot); await directory(bucket);
    const file = path.join(bucket, 'record.json'), info = await lstat(file);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 65536) throw new Error('归档记录无效');
    const record = JSON.parse(await readFile(file, 'utf8'));
    if (record.id !== id || record.version !== 1 || typeof record.fingerprint !== 'string' || !/^[0-9a-f]{64}$/.test(record.fingerprint)) throw new Error('归档记录格式无效');
    return { ...record, original: this.original(record.rootKey, record.name), destination: path.join(bucket, 'skill') };
  }
  async list() {
    if (!(await exists(this.archiveRoot))) return [];
    await directory(this.archiveRoot);
    const result = [];
    for (const item of await readdir(this.archiveRoot, { withFileTypes: true })) {
      if (!item.isDirectory() || !UUID.test(item.name)) continue;
      try {
        const r = await this.record(item.name), payload = await exists(r.destination), original = await exists(r.original);
        result.push({ id: r.id, title: r.title, original: r.original, status: payload ? (original ? 'conflict' : 'archived') : r.status === 'restored' ? 'restored' : 'incomplete', files: r.files, bytes: r.bytes });
      } catch { result.push({ id: item.name, title: '无法读取的归档记录', status: 'invalid' }); }
    }
    return result;
  }
  async previewRestore(id) {
    const r = await this.record(id);
    await directory(this.roots[r.rootKey]);
    if (await exists(r.original)) throw new Error('原位置已有内容，拒绝覆盖；请先处理冲突');
    const snapshot = await treeSnapshot(r.destination);
    if (snapshot.fingerprint !== r.fingerprint) throw new Error('归档内容与记录不一致，需人工检查');
    return this.savePlan({ action: 'restore', id, rootKey: r.rootKey, name: r.name, title: r.title, original: r.original, destination: r.destination, ...snapshot, impact: '将归档目录移回原用户技能位置；不覆盖任何已有目录。' });
  }
  async writeRecord(plan, status) {
    const bucket = this.bucket(plan.id), temporary = path.join(bucket, `${randomUUID()}.tmp`);
    const record = { version: 1, id: plan.id, rootKey: plan.rootKey, name: plan.name, title: plan.title, fingerprint: plan.fingerprint, files: plan.files, bytes: plan.bytes, status, updatedAt: new Date().toISOString() };
    try { await writeFile(temporary, JSON.stringify(record), { flag: 'wx' }); await rename(temporary, path.join(bucket, 'record.json')); }
    finally { await unlink(temporary).catch(() => {}); }
  }
  async execute(token) {
    const plan = this.plans.get(token);
    this.plans.delete(token);
    if (!plan || plan.expiresAt < Date.now()) throw new Error('预览已过期，请重新预览');
    const root = this.roots[plan.rootKey];
    await directory(root);
    // Exclude configurations that place archives inside a skill search root.
    for (const key of ['skills', 'agentSkills']) if (this.roots[key]) {
      const rel = path.relative(path.resolve(this.roots[key]), this.archiveRoot);
      if (rel === '' || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel))) throw new Error('归档目录不能位于技能扫描根目录内');
    }
    await mkdir(this.archiveRoot, { recursive: true });
    const archiveReal = await directory(this.archiveRoot);
    for (const key of ['skills', 'agentSkills']) if (this.roots[key] && await exists(this.roots[key])) {
      const rootReal = await directory(this.roots[key]), rel = path.relative(rootReal, archiveReal);
      if (rel === '' || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel))) throw new Error('归档实际位置不能位于技能扫描根目录内');
    }
    const lockFile = path.join(this.archiveRoot, 'operation.lock');
    let lock;
    try { lock = await open(lockFile, 'wx'); } catch (error) { if (error.code === 'EEXIST') throw new Error('已有归档操作占用，请稍后重新预览'); throw error; }
    try {
      const source = plan.action === 'archive' ? plan.original : plan.destination;
      const target = plan.action === 'archive' ? plan.destination : plan.original;
      if (this.original(plan.rootKey, plan.name) !== plan.original) throw new Error('技能根目录已变化');
      if ((await treeSnapshot(source)).fingerprint !== plan.fingerprint) throw new Error('预览后文件已变化，请重新预览');
      if (await exists(target)) throw new Error('目标位置已存在，拒绝覆盖');
      if (plan.action === 'archive') await mkdir(this.bucket(plan.id));
      else await directory(this.bucket(plan.id));
      await this.writeRecord(plan, `pending-${plan.action}`);
      await this.move(source, target, plan.action === 'archive' ? root : this.archiveRoot, plan.action === 'archive' ? this.archiveRoot : root);
      if ((await treeSnapshot(target)).fingerprint !== plan.fingerprint) {
        await this.writeRecord(plan, 'needs-review');
        throw new Error('移动后内容变化；文件已保留在目标位置，请人工检查记录');
      }
      const status = plan.action === 'archive' ? 'archived' : 'restored';
      await this.writeRecord(plan, status);
      return { action: plan.action, status, id: plan.id, original: plan.original, archive: plan.destination };
    } finally { await lock.close(); await unlink(lockFile); }
  }
}
