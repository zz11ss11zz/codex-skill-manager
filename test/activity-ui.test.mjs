import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {activityView,calendarDays} from '../src/activity.mjs';

test('panel switches plugin calls and skill adoptions without mixing or mislabelling',async()=>{
  const elements=[];
  class Element {
    constructor(tag){this.tag=tag;this.children=[];this.listeners={};this.style={setProperty(){}};elements.push(this);}
    append(...items){this.children.push(...items);}
    replaceChildren(...items){this.children=items;}
    setAttribute(){}
    addEventListener(event,fn){this.listeners[event]=fn;}
    checkValidity(){return true;}
  }
  const source=(await readFile(new URL('../src/activity-ui.mjs',import.meta.url),'utf8')).replace(/^import .*;\r?\n/,'').replace('export function','function');
  const context=vm.createContext({document:{createElement:tag=>new Element(tag)},activityView,calendarDays});
  vm.runInContext(source+'\nglobalThis.createPanel=createActivityPanel;',context);
  const render=context.createPanel(new Element('root'));
  const date=new Date().toISOString().slice(0,10);
  const summary={catalog:[{id:'github',name:'github',detail:'test'}],activity:{timeZone:'UTC',days:[{date,entries:[{id:'github',calls:2}]}]},coverage:{from:date+'T00:00:00Z',to:new Date().toISOString()},period:{}};
  render({skills:[],pluginCalls:summary,adoptions:{...summary,catalog:[],activity:{timeZone:'UTC',days:[]}}});
  const measure=elements.find(e=>e.tag==='select'&&e.children.some(c=>c.value==='calls'));
  assert.equal(measure.value,'adoptions');
  measure.value='calls'; measure.listeners.change();
  assert.ok(elements.some(e=>e.tag==='h2'&&e.textContent==='插件工具调用'));
  assert.ok(elements.some(e=>e.tag==='p'&&e.textContent?.includes('2 次工具调用尝试')));
  elements.find(e=>e.tag==='button'&&e.textContent==='Skill').listeners.click();
  assert.equal(measure.value,'adoptions');
  measure.value='calls';measure.listeners.change();
  render({skills:[],pluginCalls:null,adoptions:null});
  assert.ok(elements.some(e=>e.textContent==='插件调用记录暂不可读取。'));
});
