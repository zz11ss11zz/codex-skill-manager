import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {resolveLocale,translator} from '../src/i18n.mjs';
import { readFile } from 'node:fs/promises';

const source = (await readFile(new URL('../src/app.mjs', import.meta.url), 'utf8')).replace(/^import .*;\r?\n/gm, '');
const tick = () => new Promise(resolve => setImmediate(resolve));
const result = total => ({structuredContent:{mode:'inventory',skills:[],adoptions:{total}}});

test('global panel loads without a pushed result and refreshes on return without overlapping requests', async () => {
  const docEvents = {}, windowEvents = {}, updates = [], status = {setAttribute(){}}, doc = {documentElement:{},
    hidden:false, querySelector:()=>status, addEventListener:(name,fn)=>{docEvents[name]=fn;},
  };
  let now = 1000, requests = 0, resolveRequest, rejectRequest;
  class App {
    getHostContext(){return {locale:'zh-CN'};}
    connect() { return Promise.resolve(); }
    callServerTool() { requests++; return new Promise((resolve,reject)=>{resolveRequest=resolve;rejectRequest=reject;}); }
  }
  vm.runInNewContext(source, {App,navigator:{language:"zh-CN"},resolveLocale,translator,createActivityPanel:()=>Object.assign(data=>updates.push(data.adoptions.total),{setLocale(){}}),document:doc,
    window:{addEventListener:(name,fn)=>{windowEvents[name]=fn;}},Date:{now:()=>now}});
  await tick(); assert.equal(requests,1);
  windowEvents.focus(); docEvents.visibilitychange(); assert.equal(requests,1);
  resolveRequest(result(0)); await tick(); assert.deepEqual(updates,[0]); assert.equal(status.hidden,true);
  now+=2000; doc.hidden=true; docEvents.visibilitychange(); assert.equal(requests,1);
  doc.hidden=false; docEvents.visibilitychange(); windowEvents.focus(); assert.equal(requests,2);
  resolveRequest(result(3)); await tick(); assert.deepEqual(updates,[0,3]);
  now+=2000; windowEvents.focus(); rejectRequest(new Error('temporary')); await tick();
  assert.equal(status.hidden,false); assert.match(status.textContent,/保留上次结果/); assert.deepEqual(updates,[0,3]);
  now+=2000; windowEvents.focus(); resolveRequest(result(4)); await tick(); assert.equal(status.hidden,true);
});

test('an initial host result avoids a second startup scan', async () => {
  let calls=0;
  class App {
    getHostContext(){return {locale:'zh-CN'};}
    connect() { this.ontoolresult(result(1)); return Promise.resolve(); }
    callServerTool() { calls++; return Promise.resolve(result(1)); }
  }
  vm.runInNewContext(source,{App,navigator:{language:"zh-CN"},resolveLocale,translator,createActivityPanel:()=>Object.assign(()=>{},{setLocale(){}}),document:{documentElement:{},querySelector:()=>({setAttribute(){}}),addEventListener:()=>{}},
    window:{addEventListener:()=>{}},Date});
  await tick(); assert.equal(calls,0);
});


