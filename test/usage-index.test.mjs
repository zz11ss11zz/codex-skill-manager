import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, appendFile, readFile, rm, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readUsageFile, UsageIndex } from '../src/usage-index.mjs';
const row = (id, marker = 'demo') => JSON.stringify({ type: 'response_item', timestamp: '2026-01-01T00:00:00Z', payload: { type: 'message', id, role: 'user', content: [{ type: 'input_text', text: `private full prose 中文 $${marker}` }] } });
const skills = [{ id: 'demo', name: 'demo', path: '/skills/demo/SKILL.md' }];

test('incremental bytes preserve partial UTF-8 lines, recover malformed rows and do not retain prose', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'usage-lines-'));
  const file = path.join(root, 'log.jsonl');
  try {
    const second = Buffer.from(row('two'));
    const split = second.indexOf(Buffer.from('中文')) + 1;
    await writeFile(file, Buffer.concat([Buffer.from(`${row('one')}\nbroken-json\n`), second.subarray(0, split)]));
    const first = await readUsageFile(file);
    assert.equal(first.state.events.length, 1);
    assert.equal(first.state.malformed, 1);
    assert.ok(first.pendingBytes > 0);
    assert.ok(!JSON.stringify(first.state).includes('private full prose'));
    await appendFile(file, Buffer.concat([second.subarray(split), Buffer.from('\n')]));
    const next = await readUsageFile(file, first.state);
    assert.equal(next.state.events.length, 2);
    assert.equal(next.state.events[1].line, 3);
    assert.equal(next.pendingBytes, 0);
    const again = await readUsageFile(file, next.state);
    assert.equal(again.bytesRead, 0);
    assert.equal(again.state.events.length, 2);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('oversized records spanning budgets are skipped once; replaced logs reset prior signals', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'usage-budget-'));
  const file = path.join(root, 'log.jsonl');
  try {
    await writeFile(file, `${'x'.repeat(700)}\n${row('one')}\n`);
    let result = await readUsageFile(file, null, { maxBytes: 400, maxLineBytes: 300 });
    assert.equal(result.state.oversized, 1);
    assert.equal(result.state.discarding, true);
    result = await readUsageFile(file, result.state, { maxBytes: 400, maxLineBytes: 300 });
    result = await readUsageFile(file, result.state, { maxBytes: 400, maxLineBytes: 300 });
    assert.equal(result.state.events.length, 1);
    assert.equal(result.state.oversized, 1);
    assert.equal(result.state.events[0].line, 2);
    await writeFile(file, `${row('replaced', 'other')}\n`);
    const reset = await readUsageFile(file, result.state);
    assert.equal(reset.reset, true);
    assert.equal(reset.state.events.length, 1);
    assert.equal(reset.state.events[0].reference, 'other');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('persisted index resumes without double counting, reports coverage and preserves corrupt state', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'usage-index-'));
  const logs = path.join(root, 'logs'), stateFile = path.join(root, 'local', 'index.json');
  try {
    await mkdir(logs);
    await writeFile(path.join(logs, 'a.jsonl'), `${row('one')}\n`);
    const options = { roots: [logs], stateFile };
    const first = await new UsageIndex(options).refresh(skills);
    assert.equal(first.counts['explicit-marker'].events, 1);
    assert.equal(first.coverage.pendingBytes, 0);
    assert.equal(first.coverage.from, '2026-01-01T00:00:00.000Z');
    const next = await new UsageIndex(options).refresh(skills);
    assert.equal(next.counts['explicit-marker'].events, 1);
    assert.equal(next.coverage.bytesRead, 0);
    assert.ok(!(await readFile(stateFile, 'utf8')).includes('private full prose'));
    await writeFile(stateFile, 'corrupt');
    await assert.rejects(new UsageIndex(options).refresh(skills));
    assert.equal(await readFile(stateFile, 'utf8'), 'corrupt');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('bounded imports continue across files and an existing lock is not removed', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'usage-bounded-'));
  const logs = path.join(root, 'logs'), stateFile = path.join(root, 'local', 'index.json');
  try {
    await mkdir(logs);
    for (let i = 0; i < 3; i++) await writeFile(path.join(logs, `${i}.jsonl`), Array.from({ length: 8 }, (_, n) => row(`${i}-${n}`)).join('\n') + '\n');
    const index = new UsageIndex({ roots: [logs], stateFile, maxBytes: 2000, maxLineBytes: 300 });
    let result = await index.refresh(skills);
    assert.ok(result.coverage.pendingBytes > 0);
    assert.ok(result.coverage.bytesRead <= 2000);
    for (let i = 0; i < 10 && result.coverage.pendingBytes > 0; i++) result = await index.refresh(skills);
    assert.equal(result.coverage.pendingBytes, 0);
    assert.equal(result.counts['explicit-marker'].events, 24);
    await writeFile(`${stateFile}.lock`, 'other importer');
    await assert.rejects(index.refresh(skills), /已有导入/);
    assert.equal(await readFile(`${stateFile}.lock`, 'utf8'), 'other importer');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('v1 index is backed up and reparsed instead of retaining false review signals', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'usage-migrate-'));
  const logs=path.join(root,'logs'), stateFile=path.join(root,'index.json');
  try {
    await mkdir(logs);
    const file=path.join(logs,'review.jsonl');
    await writeFile(file, JSON.stringify({type:'session_meta',payload:{id:'review',source:{subagent:{other:'guardian'}}}})+'\n'+row('one')+'\n');
    const old=(await readUsageFile(file)).state;
    old.events=[{key:'old',kind:'explicit-marker',reference:'wrong',source:file,line:2}];
    delete old.parser.excludedSession;
    await writeFile(stateFile,JSON.stringify({version:1,files:{[file]:old}}));
    const result=await new UsageIndex({roots:[logs],stateFile}).refresh(skills);
    assert.equal(result.counts['explicit-marker'].events,0);
    assert.equal(result.coverage.rebuiltForParser,true);
    assert.equal(result.coverage.excludedSessionFiles,1);
    const files=await (await import('node:fs/promises')).readdir(root);
    const backup=files.find(f=>f.startsWith('index.json.v1-'));
    assert.ok(backup);
    assert.ok((await readFile(path.join(root,backup),'utf8')).includes('wrong'));
    const next=await new UsageIndex({roots:[logs],stateFile}).refresh(skills);
    assert.equal(next.coverage.rebuiltForParser,false);
    assert.equal(next.coverage.bytesRead,0);
    assert.equal(next.counts['explicit-marker'].events,0);
  } finally { await rm(root,{recursive:true,force:true}); }
});
