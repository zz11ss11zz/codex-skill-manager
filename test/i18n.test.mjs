import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parse} from 'acorn';
import {english, resolveLocale, translator} from '../src/i18n.mjs';
test('host locale wins over browser language, including regional tags',()=>{
  for(const tag of ['zh','zh-CN','zh-TW','zh-Hans']) assert.equal(resolveLocale(tag,'en-US'),'zh');
  for(const tag of ['en','en-US','en-GB']) assert.equal(resolveLocale(tag,'zh-CN'),'en');
  assert.equal(resolveLocale(undefined,'zh-CN'),'zh');
  assert.equal(resolveLocale('fr-FR','zh-CN'),'en');
  assert.equal(resolveLocale(null),'en');
});
test('translations preserve values without translating user data',()=>{
  assert.equal(translator('en')('{0} 次{1}',2,'adoptions'),'2 adoptions');
  assert.equal(translator('zh')('{0} 次{1}',2,'采用'),'2 次采用');
  assert.equal(translator('en')('第 {0} 名，{1}',1,'中文 skill {0}'),'Rank 1, 中文 skill {0}');
});
test('every literal translation key in the UI has an English message', async()=>{
 for(const file of ['app.mjs','activity-ui.mjs']){
  const ast=parse(await readFile(new URL('../src/'+file,import.meta.url),'utf8'),{ecmaVersion:'latest',sourceType:'module'});
  function walk(n){
   if(n.type==='CallExpression'&&n.callee.name==='t'&&n.arguments[0]?.type==='Literal') assert.ok(Object.hasOwn(english,n.arguments[0].value),n.arguments[0].value);
   for(const v of Object.values(n)) if(Array.isArray(v)) v.forEach(x=>x?.type&&walk(x)); else if(v?.type) walk(v);
  }
  walk(ast);
 }
});
