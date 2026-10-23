import { lstat, mkdir, open, readFile, writeFile, rename, rm, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';
import { dataDirectory } from './data-path.mjs';
import { Adoptions } from './adoptions.mjs';
import { PluginCalls } from './plugin-calls.mjs';
import { SkillNotes } from './skill-notes.mjs';

const files = ['adoptions.json', 'plugin-calls.json', 'skill-notes.json', 'usage-index.json'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function stat(file) {
  try { return await lstat(file); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function directory(dir) {
  const info = await stat(dir);
  if (info && (!info.isDirectory() || info.isSymbolicLink())) throw new Error('数据目录不能是链接或普通文件');
  // Reject linked ancestors too; migrating through a junction obscures the destination.
  const parent = path.dirname(dir);
  if (parent !== dir) await directory(parent);
}
async function validate(dir) {
  await new Adoptions(path.join(dir, files[0])).read();
  await new PluginCalls(path.join(dir, files[1])).read();
  await new SkillNotes(path.join(dir, files[2])).read();
  const file = path.join(dir, files[3]);
  if (!await stat(file)) return;
  const state = JSON.parse(await readFile(file, 'utf8'));
  if (![1, 2].includes(state?.version) || !state.files || typeof state.files !== 'object' || Array.isArray(state.files)) throw new Error('迁移索引格式无效');
  for (const [name, s] of Object.entries(state.files)) {
    if (!s || s.path !== name || !Number.isSafeInteger(s.offset) || s.offset < 0 || !Array.isArray(s.events) || !s.parser || !Number.isSafeInteger(s.prefixLength) || !Number.isSafeInteger(s.anchorStart) || s.anchorStart < 0 || s.anchorStart > s.offset || s.offset - s.anchorStart > 4096 || s.prefixLength < 0 || s.prefixLength > 4096) throw new Error('迁移索引损坏');
  }
  if (state.version === 2 && !state.coverage) throw new Error('迁移索引缺少覆盖信息');
}

// Publication is one directory rename: a failed or interrupted copy is never live data.
// Stop the old service before migrating; its writers honor the same per-file locks.
export async function initializeData({
  target = dataDirectory(),
  source = process.env.CODEX_SKILL_MANAGER_LEGACY_DIR || fileURLToPath(new URL('../.local', import.meta.url)),
  explicitSource = Boolean(process.env.CODEX_SKILL_MANAGER_LEGACY_DIR),
} = {}) {
  if (!path.isAbsolute(target) || !path.isAbsolute(source)) throw new Error('数据和迁移来源必须是绝对路径');
  target = path.normalize(target); source = path.normalize(source);
  const compare = value => process.platform === 'win32' ? value.toLowerCase() : value;
  const targetKey = compare(target), sourceKey = compare(source);
  if (targetKey === sourceKey || targetKey.startsWith(sourceKey + path.sep) || sourceKey.startsWith(targetKey + path.sep)) throw new Error('迁移来源与目标不能相同或嵌套');
  await directory(target); await directory(source);
  await mkdir(path.dirname(target), { recursive: true });
  const lockPath = `${target}.migration.lock`;
  let lock;
  try { lock = await open(lockPath, 'wx', 0o600); }
  catch (error) { if (error.code === 'EEXIST') throw new Error('数据初始化被占用；确认全部服务已停止后检查 migration.lock'); throw error; }
  const held = [], staging = `${target}.staging-${randomUUID()}`;
  let staged = false;
  try {
    if (await stat(target)) {
      const receipt = JSON.parse(await readFile(path.join(target, 'migration.json'), 'utf8'));
      if (receipt.version !== 1 || !Array.isArray(receipt.files)) throw new Error('持久目录迁移记录无效，拒绝覆盖');
      if (explicitSource && compare(receipt.source || '') !== sourceKey) throw new Error('持久目录已初始化自其他来源；拒绝自动合并，请使用新的测试目录');
      return { directory: target, migrated: false, receipt };
    }
    const exists = await stat(source);
    if (explicitSource && !exists) throw new Error('指定的旧数据目录不存在');
    if (exists) {
      for (const name of files) {
        const lockFile = path.join(source, `${name}.lock`);
        const handle = await open(lockFile, 'wx', 0o600);
        held.push({ handle, file: lockFile });
      }
    }
    await mkdir(staging); staged = true;
    await mkdir(path.join(staging, 'migration-backup'));
    const copied = [];
    for (const name of files) {
      const file = path.join(source, name), info = await stat(file);
      if (!info) continue;
      const limit = name === 'usage-index.json' ? 64 : name === 'skill-notes.json' ? 4 : 32;
      if (!info.isFile() || info.isSymbolicLink() || info.size > limit * 1024 * 1024) throw new Error(`旧数据文件类型或容量无效：${name}`);
      const bytes = await readFile(file);
      for (const dest of [path.join(staging, name), path.join(staging, 'migration-backup', name)]) await writeFile(dest, bytes, { flag: 'wx', mode: 0o600 });
      copied.push({ name, sha256: hash(bytes), bytes: bytes.length });
    }
    await validate(staging);
    const receipt = { version: 1, source: exists ? source : null, createdAt: new Date().toISOString(), files: copied };
    await writeFile(path.join(staging, 'migration.json'), JSON.stringify(receipt, null, 2), { flag: 'wx', mode: 0o600 });
    await rename(staging, target); staged = false;
    return { directory: target, migrated: copied.length > 0, receipt };
  } finally {
    if (staged) await rm(staging, { recursive: true, force: true });
    for (const { handle, file } of held.reverse()) { await handle.close(); await unlink(file); }
    await lock.close(); await unlink(lockPath);
  }
}
