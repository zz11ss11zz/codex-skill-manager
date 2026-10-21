import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, rmdir, symlink } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { ArchiveManager, moveDirectory } from '../src/archive.mjs';
import { scanInventory } from '../src/inventory.mjs';

async function fixture() {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'skill-archive-'));
  const roots = { skills: path.join(temp, '用户技能'), cache: path.join(temp, 'cache') };
  const skillDir = path.join(roots.skills, 'demo');
  await mkdir(path.join(skillDir, 'scripts'), { recursive: true });
  await writeFile(path.join(skillDir, 'SKILL.md'), '---\nname: demo\ndescription: synthetic\n---\n');
  await writeFile(path.join(skillDir, 'scripts', 'data.txt'), 'synthetic resource');
  const manager = new ArchiveManager({ roots, archiveRoot: path.join(temp, 'archive') });
  const skill = (await scanInventory(roots)).skills.find(s => s.name === 'demo');
  return { temp, roots, skillDir, manager, skill };
}

test('Windows archive and restore preserve all files, enforce preview tokens and refuse existing destinations', { skip: process.platform !== 'win32' }, async () => {
  const f = await fixture();
  try {
    const plan = await f.manager.previewArchive(f.skill.id);
    assert.equal(plan.files, 2);
    assert.equal(await readFile(path.join(f.skillDir, 'scripts', 'data.txt'), 'utf8'), 'synthetic resource');
    const archived = await f.manager.execute(plan.token);
    assert.equal(archived.status, 'archived');
    await assert.rejects(readFile(path.join(f.skillDir, 'SKILL.md')));
    assert.equal((await f.manager.list())[0].status, 'archived');
    await assert.rejects(f.manager.execute(plan.token), /预览已过期/);
    const restore = await f.manager.previewRestore(plan.id);
    await mkdir(f.skillDir);
    await assert.rejects(f.manager.execute(restore.token), /目标位置已存在/);
    await rmdir(f.skillDir); // This empty directory was created only by this test.
    const retry = await f.manager.previewRestore(plan.id);
    assert.equal((await f.manager.execute(retry.token)).status, 'restored');
    assert.equal(await readFile(path.join(f.skillDir, 'scripts', 'data.txt'), 'utf8'), 'synthetic resource');
    assert.equal((await f.manager.list())[0].status, 'restored');
  } finally { await rm(f.temp, { recursive: true, force: true }); }
});

test('changed content, system skills, links and invalid archive ids are refused', async () => {
  const f = await fixture();
  try {
    const preview = await f.manager.previewArchive(f.skill.id);
    await writeFile(path.join(f.skillDir, 'scripts', 'data.txt'), 'changed');
    await assert.rejects(f.manager.execute(preview.token), /文件已变化/);
    const expired = await f.manager.previewArchive(f.skill.id);
    f.manager.plans.get(expired.token).expiresAt = 0;
    await assert.rejects(f.manager.execute(expired.token), /预览已过期/);
    await mkdir(path.join(f.roots.skills, '.system', 'system'), { recursive: true });
    await writeFile(path.join(f.roots.skills, '.system', 'system', 'SKILL.md'), '---\nname: system\ndescription: test\n---\n');
    const system = (await scanInventory(f.roots)).skills.find(s => s.name === 'system');
    await assert.rejects(f.manager.previewArchive(system.id), /仅允许归档用户技能/);
    await symlink(path.join(f.skillDir, 'scripts'), path.join(f.skillDir, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(f.manager.previewArchive(f.skill.id), /含链接/);
    await assert.rejects(f.manager.previewRestore('../outside'), /归档 ID 无效/);
  } finally { await rm(f.temp, { recursive: true, force: true }); }
});

test('failed moves preserve source and leave a recoverable operation journal', async () => {
  const f = await fixture();
  try {
    f.manager.move = async () => { throw new Error('synthetic move failure'); };
    const plan = await f.manager.previewArchive(f.skill.id);
    await assert.rejects(f.manager.execute(plan.token), /synthetic move failure/);
    assert.equal(await readFile(path.join(f.skillDir, 'scripts', 'data.txt'), 'utf8'), 'synthetic resource');
    assert.equal((await f.manager.list())[0].status, 'incomplete');
    const record = JSON.parse(await readFile(path.join(f.manager.archiveRoot, plan.id, 'record.json'), 'utf8'));
    assert.equal(record.status, 'pending-archive');
  } finally { await rm(f.temp, { recursive: true, force: true }); }
});

test('Windows native move refuses an existing empty directory and out-of-bound paths', { skip: process.platform !== 'win32' }, async () => {
  const f = await fixture();
  try {
    const target = path.join(f.temp, 'existing');
    await mkdir(target);
    await assert.rejects(moveDirectory(f.skillDir, target, f.roots.skills, f.temp));
    assert.equal(await readFile(path.join(f.skillDir, 'scripts', 'data.txt'), 'utf8'), 'synthetic resource');
    await assert.rejects(moveDirectory(f.skillDir, target, path.join(f.temp, 'other'), f.temp), /超出允许目录/);
  } finally { await rm(f.temp, { recursive: true, force: true }); }
});
