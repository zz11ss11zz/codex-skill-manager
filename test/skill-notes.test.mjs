import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { SkillNotes } from '../src/skill-notes.mjs';
const input = { id: 'a'.repeat(64), fingerprint: 'b'.repeat(64), note: '低频：月度使用，保留。', retain: true, expectedRevision: 0 };
test('notes persist, use revision checks and can clear without resetting the revision', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'skill-notes-'));
  try {
    const file = path.join(root, 'notes.json'), notes = new SkillNotes(file);
    assert.deepEqual((await notes.read()).entries, {});
    await notes.save(input);
    assert.equal((await new SkillNotes(file).read()).entries[input.id].note, input.note);
    await assert.rejects(notes.save(input), /其他页面/);
    await notes.save({ ...input, expectedRevision: 1, retain: false, note: '' });
    assert.equal((await notes.read()).entries[input.id].revision, 2);
    assert.equal((await notes.read()).entries[input.id].retain, false);
    const before = await readFile(file, 'utf8');
    await writeFile(`${file}.lock`, 'other writer');
    await assert.rejects(notes.save({ ...input, expectedRevision: 2 }));
    assert.equal(await readFile(file, 'utf8'), before);
    assert.equal(await readFile(`${file}.lock`, 'utf8'), 'other writer');
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('invalid arguments and corrupt notes do not overwrite saved data', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'skill-notes-invalid-'));
  try {
    const file = path.join(root, 'notes.json'), notes = new SkillNotes(file);
    await assert.rejects(notes.save({ ...input, note: 'x'.repeat(1001) }));
    await writeFile(file, 'corrupt');
    await assert.rejects(notes.save(input));
    assert.equal(await readFile(file, 'utf8'), 'corrupt');
  } finally { await rm(root, { recursive: true, force: true }); }
});
