import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { scanInventory } from '../src/inventory.mjs';

test('Chinese paths, nested examples, conflicting names, old caches and invalid manifests', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'skill-manager-'));
  const roots = { skills: path.join(temp, '中文技能'), cache: path.join(temp, 'cache') };
  async function file(relative, text) { const target = path.join(temp, relative); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, text); }
  const skill = '---\nname: same-name\ndescription: >\n  multi line\n  description\n---\nbody';
  try {
    await file('中文技能/a/SKILL.md', skill);
    await file('中文技能/b/SKILL.md', skill + 'different');
    await file('中文技能/a/examples/nested/SKILL.md', skill);
    await file('中文技能/.system/system/SKILL.md', skill);
    for (const version of ['1.0', '2.0']) {
      await file(`cache/market/plugin/${version}/.codex-plugin/plugin.json`, '{"name":"plugin","skills":"./skills"}');
      await file(`cache/market/plugin/${version}/skills/demo/SKILL.md`, skill);
    }
    await file('cache/market/escape/1/.codex-plugin/plugin.json', '{"skills":"../../../../中文技能"}');
    await file('cache/market/unknown/1/skills/ghost/SKILL.md', skill);
    await file('cache/market/tools-only/1/.codex-plugin/plugin.json', '{"name":"tools-only"}');
    const result = await scanInventory(roots);
    assert.equal(result.skills.length, 5);
    assert.equal(new Set(result.skills.map(s => s.id)).size, 5);
    assert.equal(new Set(result.skills.map(s => s.fingerprint)).size, 2);
    assert.equal(result.skills.filter(s => s.owner).length, 2);
    assert.ok(result.skills.filter(s => s.owner).every(s => s.state.startsWith('缓存候选')));
    assert.equal(result.skills[0].description, 'multi line description\n');
    assert.ok(result.issues.some(i => i.reason.includes('超出插件目录')));
    assert.ok(result.issues.some(i => i.reason.includes('缺少有效插件')));
    assert.ok(!result.issues.some(i => i.path.includes('tools-only')));
    assert.equal(result.usage, null);
    assert.equal(result.comparisons.identicalDocuments.length, 1);
    assert.equal(result.comparisons.identicalDocuments[0].ids.length, 4);
    assert.equal(result.comparisons.nameConflicts.length, 1);
    assert.equal(result.comparisons.nameConflicts[0].ids.length, 5);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('directory junctions are skipped and malformed frontmatter remains visible', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'skill-manager-links-'));
  try {
    await mkdir(path.join(temp, 'skills', 'bad'), { recursive: true });
    await mkdir(path.join(temp, 'outside'));
    await writeFile(path.join(temp, 'skills', 'bad', 'SKILL.md'), 'no frontmatter');
    await symlink(path.join(temp, 'outside'), path.join(temp, 'skills', 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
    const result = await scanInventory({ skills: path.join(temp, 'skills'), cache: path.join(temp, 'missing') });
    assert.equal(result.skills.length, 1);
    assert.deepEqual(result.comparisons.identicalDocuments, []);
    assert.deepEqual(result.comparisons.nameConflicts, []);
    assert.equal(result.comparisons.descriptionOverlap.eligibleInstances, 0);
    assert.ok(result.issues.some(i => i.reason.includes('符号链接')));
    assert.ok(result.issues.some(i => i.reason.includes('元数据无效')));
    assert.ok(result.issues.some(i => i.reason === '目录不存在'));
  } finally { await rm(temp, { recursive: true, force: true }); }
});
