import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, writeFile, rm, readdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import os from 'node:os';
import path from 'node:path';
import {Adoptions} from '../src/adoptions.mjs';
import {acquireAdoptionLock} from '../src/adoption-lock.mjs';

const inventory=[{id:'a',name:'demo',source:'用户技能',fingerprint:'abc'}];
const args={id:'lock-batch-00000001',skills:['demo']};
const adoptionModule=JSON.stringify(new URL('../src/adoptions.mjs',import.meta.url).href);
function child(file, body) {
  const code=`import {Adoptions} from ${adoptionModule}; const ledger=new Adoptions(${JSON.stringify(file)}); const inventory=${JSON.stringify(inventory)}; const args=${JSON.stringify(args)}; ${body}`;
  const process=spawn(globalThis.process.execPath,['--input-type=module','-e',code],{stdio:['ignore','pipe','pipe'],windowsHide:true});
  let stderr=''; process.stderr.on('data',data=>{stderr+=data;});
  const finished=once(process,'exit').then(([code,signal])=>({code,signal,stderr}));
  return {process,finished};
}
async function leaveDeadOwner(file) {
  const worker=child(file,'await ledger.record(args,()=>{process.exit(0);});');
  const result=await worker.finished;
  assert.equal(result.code,0,result.stderr);
  return JSON.parse(await readFile(`${file}.lock`,'utf8'));
}

test('live owner is protected; exit without finally releases the next record through recovery', {timeout:15000}, async () => {
  const dir=await mkdtemp(path.join(os.tmpdir(),'adoption-lock-')), file=path.join(dir,'records.json');
  let worker;
  try {
    worker=child(file,'await ledger.record(args,async()=>{process.stdout.write("ready"); await new Promise(()=>{setInterval(()=>{},1000);});});');
    const ready=await Promise.race([once(worker.process.stdout,'data'),worker.finished.then(r=>{throw new Error(`Child exited early: ${r.stderr}`);})]);
    assert.match(String(ready[0]),/ready/);
    const before=await readFile(`${file}.lock`,'utf8');
    await assert.rejects(new Adoptions(file).record(args,inventory),/占用/);
    assert.equal(await readFile(`${file}.lock`,'utf8'),before);
    worker.process.kill(); await worker.finished;
    await new Adoptions(file).record(args,inventory);
    assert.equal((await new Adoptions(file).summary()).total,1);
    assert.deepEqual(await readdir(dir),['records.json']);
  } finally {if(worker){worker.process.kill();await worker.finished;} await rm(dir,{recursive:true,force:true});}
});

test('unknown owners and interrupted recovery claims remain untouched', {timeout:15000}, async () => {
  const dir=await mkdtemp(path.join(os.tmpdir(),'adoption-lock-')), file=path.join(dir,'records.json');
  try {
    const owner=await leaveDeadOwner(file), lock=`${file}.lock`;
    for(const value of ['', 'corrupt', JSON.stringify({...owner,host:'unverified-other-host'}),JSON.stringify({...owner,pid:0})]) {
      await writeFile(lock,value);
      await assert.rejects(acquireAdoptionLock(lock),/核查/);
      assert.equal(await readFile(lock,'utf8'),value);
    }
    const original=JSON.stringify(owner); await writeFile(lock,original);
    const recovery=`${lock}.${owner.token}.recovery`;
    await writeFile(recovery,'interrupted recovery');
    await assert.rejects(acquireAdoptionLock(lock),/恢复操作/);
    assert.equal(await readFile(lock,'utf8'),original);
    assert.equal(await readFile(recovery,'utf8'),'interrupted recovery');
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('competing processes recover one dead lock without losing or double counting batches', {timeout:20000}, async () => {
  const dir=await mkdtemp(path.join(os.tmpdir(),'adoption-lock-')), file=path.join(dir,'records.json');
  const workers=[];
  try {
    await leaveDeadOwner(file);
    for(let i=0;i<4;i++) workers.push(child(file,`args.id='concurrent-batch-00000${i}'; for(let attempt=0;;attempt++){try{await ledger.record(args,inventory);break;}catch(error){if(attempt>=99)throw error;await new Promise(resolve=>setTimeout(resolve,10));}} await ledger.record(args,()=>{throw new Error('unexpected rescan');});`));
    for(const result of await Promise.all(workers.map(w=>w.finished))) assert.equal(result.code,0,result.stderr);
    assert.equal((await new Adoptions(file).summary()).total,4);
    assert.equal(Object.keys(JSON.parse(await readFile(file,'utf8')).batches).length,4);
    assert.deepEqual(await readdir(dir),['records.json']);
  } finally {for(const worker of workers){worker.process.kill();await worker.finished;} await rm(dir,{recursive:true,force:true});}
});
