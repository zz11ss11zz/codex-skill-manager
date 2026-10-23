import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {PluginCalls} from '../src/plugin-calls.mjs';
import {Adoptions} from '../src/adoptions.mjs';
import {activityView} from '../src/activity.mjs';

test('plugin calls stay independent, deduplicate invocation IDs and preserve conflicts atomically',async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'plugin-calls-'));
  try {
    const file=path.join(root,'calls.json'), store=new PluginCalls(file);
    const a={id:'test-invocation-00001',plugin:'github',tool:'mcp__codex_apps__github_get_repo'};
    await store.record([a,a]); const before=await readFile(file,'utf8');
    await store.record([a]); assert.equal(await readFile(file,'utf8'),before);
    await assert.rejects(store.record([{...a,id:'test-invocation-00002'},{...a,tool:'mcp__codex_apps__github_fetch_pr'}]));
    assert.equal(await readFile(file,'utf8'),before);
    await assert.rejects(store.record([{...a,plugin:'slack'}]));
    await store.record([{...a,id:'test-invocation-00002'}]);
    const summary=await new PluginCalls(file).summary({timeZone:'Asia/Shanghai'});
    assert.equal(summary.total,2); assert.equal(summary.tools[0].count,2);
    assert.equal((await new Adoptions(path.join(root,'adoptions.json')).summary()).total,0);
    const year=Number(summary.activity.days[0].date.slice(0,4));
    const view=activityView({skills:[],usage:summary},'plugins',year,'calls');
    assert.equal(view.total,2); assert.equal(view.top[0].name,'github');
    assert.equal(activityView({skills:[],usage:summary},'skills',year,'calls').total,0);
    assert.equal((await store.summary({to:'2000-01-01T00:00:00Z'})).total,0);
    await assert.rejects(store.summary({timeZone:'invalid/zone'}));
    await assert.rejects(store.summary({from:'2026-02-01',to:'2026-01-01'}));
    const saved=JSON.parse(await readFile(file,'utf8'));
    saved.calls[0].at='2026-10-21T16:05:00Z'; saved.calls[1].at='2026-10-21T15:55:00Z';
    await writeFile(file,JSON.stringify(saved));
    assert.deepEqual((await store.summary({timeZone:'Asia/Shanghai'})).activity.days.map(d=>d.date),['2026-10-21','2026-10-22']);
    await writeFile(file,'broken');
    await assert.rejects(store.record([a])); assert.equal(await readFile(file,'utf8'),'broken');
  } finally {await rm(root,{recursive:true,force:true});}
});
