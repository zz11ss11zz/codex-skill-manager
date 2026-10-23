import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { initializeData } from '../src/data-migration.mjs';
import { dataDirectory } from '../src/data-path.mjs';
import { SkillNotes } from '../src/skill-notes.mjs';
import { Adoptions } from '../src/adoptions.mjs';
import { PluginCalls } from '../src/plugin-calls.mjs';
import { UsageIndex } from '../src/usage-index.mjs';

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'manager-data-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = path.join(root, '旧版本 with spaces', '.local'), target = path.join(root, 'persistent', 'data-v1');
  await mkdir(source, { recursive: true });
  const id = 'a'.repeat(64), fingerprint = 'b'.repeat(64);
  await new SkillNotes(path.join(source, 'skill-notes.json')).save({ id, fingerprint, note: '保留备注', retain: true, expectedRevision: 0 });
  await new Adoptions(path.join(source, 'adoptions.json')).record({ id: 'migration_batch_001', skills: ['demo', 'demo'] }, [{ id, name: 'demo', fingerprint }]);
  await new PluginCalls(path.join(source, 'plugin-calls.json')).record([{ id: 'migration_call_001', plugin: 'demo', tool: 'mcp__codex_apps__demo_read' }]);
  await writeFile(path.join(source, 'usage-index.json'), JSON.stringify({ version: 2, files: {}, coverage: { indexedFiles: 0, pendingBytes: 0, issues: [] } }));
  return { root, source, target, id, fingerprint };
}

test('persistent directory is independent of package location and rejects relative overrides', () => {
  const home = path.resolve('isolated-home');
  assert.equal(dataDirectory({}, home), path.join(home, '.codex', 'skill-manager', 'data-v1'));
  assert.equal(dataDirectory({ CODEX_HOME: home }), path.join(home, 'skill-manager', 'data-v1'));
  assert.throws(() => dataDirectory({ CODEX_SKILL_MANAGER_DATA_DIR: 'relative' }), /绝对路径/);
});

test('migration preserves all stores and byte-identical rollback backup; restart never overwrites new records', async t => {
  const f = await fixture(t);
  const first = await initializeData(f);
  assert.equal(first.migrated, true);
  for (const { name } of first.receipt.files) {
    assert.deepEqual(await readFile(path.join(f.source, name)), await readFile(path.join(f.target, name)));
    assert.deepEqual(await readFile(path.join(f.source, name)), await readFile(path.join(f.target, 'migration-backup', name)));
  }
  assert.equal((await new Adoptions(path.join(f.target, 'adoptions.json')).summary()).total, 2);
  assert.equal((await new PluginCalls(path.join(f.target, 'plugin-calls.json')).summary()).total, 1);
  assert.equal((await new UsageIndex({ stateFile: path.join(f.target, 'usage-index.json') }).query([])).totalEvents, 0);
  await new SkillNotes(path.join(f.target, 'skill-notes.json')).save({ id: f.id, fingerprint: f.fingerprint, note: '升级后新增', retain: true, expectedRevision: 1 });
  assert.equal((await initializeData(f)).migrated, false);
  // A replacement package has a different (possibly absent) .local directory.
  await initializeData({ target: f.target, source: path.join(f.root, 'next-package', '.local') });
  assert.equal((await new SkillNotes(path.join(f.target, 'skill-notes.json')).read()).entries[f.id].note, '升级后新增');
  assert.equal((await new SkillNotes(path.join(f.source, 'skill-notes.json')).read()).entries[f.id].note, '保留备注');
  // Restoring into a separate directory leaves current data untouched.
  const restored = path.join(f.root, 'restored');
  await initializeData({ source: path.join(f.target, 'migration-backup'), target: restored, explicitSource: true });
  assert.equal((await new SkillNotes(path.join(restored, 'skill-notes.json')).read()).entries[f.id].note, '保留备注');
});

test('corrupt source fails atomically and can be retried after repair', async t => {
  const f = await fixture(t), file = path.join(f.source, 'plugin-calls.json'), original = await readFile(file);
  await writeFile(file, '{broken');
  await assert.rejects(initializeData(f));
  await assert.rejects(readFile(path.join(f.target, 'migration.json')), { code: 'ENOENT' });
  assert.equal(await readFile(file, 'utf8'), '{broken');
  assert.equal((await readdir(path.dirname(f.target))).length, 0);
  await writeFile(file, original);
  assert.equal((await initializeData(f)).migrated, true);
});

test('busy legacy writer and concurrent startup never publish partial state', async t => {
  const f = await fixture(t), busy = path.join(f.source, 'skill-notes.json.lock');
  await writeFile(busy, 'existing writer');
  await assert.rejects(initializeData(f), { code: 'EEXIST' });
  assert.equal(await readFile(busy, 'utf8'), 'existing writer');
  assert.ok(!(await readdir(f.source)).includes('adoptions.json.lock'));
  await rm(busy);
  const results = await Promise.allSettled([initializeData(f), initializeData(f)]);
  assert.ok(results.some(r => r.status === 'fulfilled'));
  assert.equal((await initializeData(f)).receipt.files.length, 4);
});

test('explicit missing source, conflicting source and unrecognized target are rejected', async t => {
  const f = await fixture(t);
  await assert.rejects(initializeData({ ...f, source: path.join(f.root, 'missing'), explicitSource: true }), /不存在/);
  await initializeData(f);
  await assert.rejects(initializeData({ ...f, source: path.join(f.root, 'other'), explicitSource: true }), /其他来源/);
  const unknown = path.join(f.root, 'unknown'); await mkdir(unknown);
  await writeFile(path.join(unknown, 'skill-notes.json'), 'keep me');
  await assert.rejects(initializeData({ source: f.source, target: unknown }));
  assert.equal(await readFile(path.join(unknown, 'skill-notes.json'), 'utf8'), 'keep me');
});
