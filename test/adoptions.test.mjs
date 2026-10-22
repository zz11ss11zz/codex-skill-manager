import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,stat} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Adoptions} from '../src/adoptions.mjs';
const inventory = [{id:'a',name:'demo',path:'D:/skills/demo/SKILL.md',source:'用户技能',fingerprint:'abc'}];
test('batch writes preserve repeated adoption, retries are idempotent, conflicts preserve data and restart restores totals', async () => {
  const dir=await mkdtemp(path.join(os.tmpdir(),'adoptions-')), file=path.join(dir,'records.json');
  try {
    const ledger=new Adoptions(file);
    assert.equal((await ledger.summary()).coverage.from,null);
    const args={id:'batch-000000000001',skills:['demo','demo']};
    await ledger.record(args,inventory);
    const first=await readFile(file,'utf8');
    await ledger.record(args,inventory);
    assert.equal(await readFile(file,'utf8'),first);
    await assert.rejects(ledger.record({...args,skills:['demo']},inventory),/内容不同/);
    assert.equal(await readFile(file,'utf8'),first);
    await ledger.record({id:'batch-000000000002',skills:['demo']},inventory);
    const summary=await new Adoptions(file).summary({timeZone:'Asia/Shanghai'});
    assert.equal(summary.total,3);
    assert.equal(summary.activity.days[0].entries[0].adoptions,3);
    assert.equal(summary.activity.days[0].entries[0].reads,0);
    assert.equal((await ledger.summary({to:'2000-01-01T00:00:00Z'})).total,0);
    assert.ok(!JSON.stringify(summary).includes('D:/skills'));
    await assert.rejects(ledger.summary({from:'2026-02-01T00:00:00Z',to:'2026-01-01T00:00:00Z'}));
  } finally {await rm(dir,{recursive:true,force:true});}
});
test('request identity survives removed or ambiguous inventory without rescanning or rewriting', async () => {
  const dir=await mkdtemp(path.join(os.tmpdir(),'adoptions-')), file=path.join(dir,'records.json');
  try {
    const ledger=new Adoptions(file), args={id:'retry-000000000001',skills:['demo','demo']};
    await ledger.record(args,inventory);
    const first=await readFile(file,'utf8'), before=await stat(file);
    await ledger.record(args,[]);
    await ledger.record(args,[...inventory,{...inventory[0],id:'b'}]);
    const unavailable=()=>{throw new Error('inventory should not be scanned');};
    await ledger.record(args,unavailable);
    await assert.rejects(ledger.record({...args,skills:['removed']},unavailable),/内容不同/);
    await assert.rejects(ledger.record({...args,skills:['demo']},unavailable),/内容不同/);
    assert.equal(await readFile(file,'utf8'),first);
    assert.equal((await stat(file)).mtimeMs,before.mtimeMs);
    assert.equal((await ledger.summary()).total,2);
    assert.ok(!first.includes('D:/skills'));
  } finally {await rm(dir,{recursive:true,force:true});}
});
test('legacy batches without request hashes remain readable and preserve their original counts', async () => {
  const dir=await mkdtemp(path.join(os.tmpdir(),'adoptions-')), file=path.join(dir,'records.json');
  try {
    const ledger=new Adoptions(file), args={id:'legacy-00000000001',skills:['demo']};
    await ledger.record(args,inventory);
    const state=JSON.parse(await readFile(file,'utf8'));
    delete state.batches[args.id].requestHash;
    await writeFile(file,JSON.stringify(state));
    const before=await readFile(file,'utf8');
    await ledger.record(args,inventory);
    assert.equal(await readFile(file,'utf8'),before);
    assert.equal((await ledger.summary()).total,1);
    state.batches[args.id].requestHash='invalid';
    await writeFile(file,JSON.stringify(state));
    await assert.rejects(ledger.summary(),/摘要无效/);
  } finally {await rm(dir,{recursive:true,force:true});}
});
test('ambiguous names reject whole batch, explicit paths resolve, locks and corrupt records are preserved', async () => {
  const dir=await mkdtemp(path.join(os.tmpdir(),'adoptions-')), file=path.join(dir,'records.json');
  try {
    const ledger=new Adoptions(file), both=[...inventory,{...inventory[0],id:'b',path:'D:/other/SKILL.md'}];
    await assert.rejects(ledger.record({id:'batch-000000000001',skills:['demo']},both),/唯一匹配/);
    assert.equal((await ledger.summary()).total,0);
    await ledger.record({id:'batch-000000000001',skills:[inventory[0].path]},both);
    await writeFile(`${file}.lock`,'other');
    await assert.rejects(ledger.record({id:'batch-000000000002',skills:[inventory[0].path]},both));
    assert.equal(await readFile(`${file}.lock`,'utf8'),'other');
    await rm(`${file}.lock`);
    await writeFile(file,'corrupt');
    await assert.rejects(ledger.record({id:'batch-000000000002',skills:[inventory[0].path]},both));
    assert.equal(await readFile(file,'utf8'),'corrupt');
  } finally {await rm(dir,{recursive:true,force:true});}
});
