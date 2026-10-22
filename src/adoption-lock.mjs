import { lstat, readFile, writeFile, link, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';

const validToken = value => typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
async function ownerAt(file) {
  const info = await lstat(file);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 4096) throw new Error('采用锁类型无效，保留原文件，请人工核查');
  let owner;
  try { owner = JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') throw error; throw new Error('采用锁信息不完整，保留原文件，请人工核查'); }
  if (owner?.version !== 1 || !validToken(owner.token) || !Number.isInteger(owner.pid) || owner.pid < 1 || owner.pid > 2147483647 || owner.host !== hostname() || typeof owner.createdAt !== 'string' || !Number.isFinite(Date.parse(owner.createdAt))) throw new Error('采用锁来源无法核验，保留原文件，请人工核查');
  return owner;
}
function isExited(owner) {
  try { process.kill(owner.pid, 0); return false; }
  catch (error) { return error.code === 'ESRCH'; } // Permission errors and reused PIDs remain protected.
}
async function publishOwner(file) {
  const owner = {version: 1, token: randomUUID(), pid: process.pid, host: hostname(), createdAt: new Date().toISOString()};
  const candidate = `${file}.${owner.token}.tmp`;
  try {
    await writeFile(candidate, JSON.stringify(owner), {flag: 'wx', mode: 0o600});
    // Publish complete metadata exclusively: a crash cannot leave a new empty lock.
    await link(candidate, file);
  } finally { await unlink(candidate).catch(() => {}); }
  return async () => {
    const current = await ownerAt(file);
    if (current.token !== owner.token) throw new Error('采用锁所有者已变化，拒绝删除');
    await unlink(file);
  };
}

export async function acquireAdoptionLock(file) {
  try { return await publishOwner(file); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  let observed;
  try { observed = await ownerAt(file); }
  catch (error) { if (error.code === 'ENOENT') return publishOwner(file); throw error; }
  if (!isExited(observed)) throw new Error('采用记录仍被占用或进程状态无法确认，请稍后用原批次重试');
  // Only one reaper for this exact generation may remove the dead owner's lock.
  // A stranded recovery claim is never reclaimed automatically.
  const recovery = `${file}.${observed.token}.recovery`;
  let releaseRecovery;
  try { releaseRecovery = await publishOwner(recovery); }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error('该采用锁已有恢复操作；若持续失败，请核查恢复进程，保留原批次重试');
    throw error;
  }
  let acquired;
  try {
    let current;
    try { current = await ownerAt(file); }
    catch (error) { if (error.code === 'ENOENT') return acquired = await publishOwner(file); throw error; }
    if (current.token !== observed.token || current.pid !== observed.pid || current.createdAt !== observed.createdAt || !isExited(current)) throw new Error('采用锁已变化，未删除，请用原批次重试');
    await unlink(file);
    // Another writer may win here. Never delete its lock to force acquisition.
    return acquired = await publishOwner(file);
  } finally {
    try { await releaseRecovery(); }
    catch (error) { if (acquired) await acquired(); throw error; }
  }
}
