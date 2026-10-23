import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {translator} from '../src/i18n.mjs';
import {activityView,calendarDays} from '../src/activity.mjs';

test('panel switches plugin calls and skill adoptions without mixing or mislabelling',async()=>{
  const elements=[];
  class Element {
    constructor(tag){this.tag=tag;this.children=[];this.listeners={};this.style={setProperty(){}};elements.push(this);}
    append(...items){for(const item of items) item.parentNode=this;this.children.push(...items);}
    get firstChild(){return this;}
    replaceChildren(...items){this.children=items;}
    setAttribute(){}
    addEventListener(event,fn){this.listeners[event]=fn;}
    checkValidity(){return true;}
  }
  const source=(await readFile(new URL('../src/activity-ui.mjs',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'').replace('export function','function');
  const context=vm.createContext({document:{createElement:tag=>new Element(tag)},activityView,calendarDays,translator});
  vm.runInContext(source+'\nglobalThis.createPanel=createActivityPanel;',context);
  const render=context.createPanel(new Element('root'));
  const date=new Date().toISOString().slice(0,10);
  const summary={catalog:[{id:'github',name:'github',detail:'test'}],activity:{timeZone:'UTC',days:[{date,entries:[{id:'github',calls:2}]}]},coverage:{from:date+'T00:00:00Z',to:new Date().toISOString()},period:{}};
  render({skills:[{id:'skill-a',name:'example',source:'test'}],pluginCalls:summary,adoptions:{...summary,catalog:[],activity:{timeZone:'UTC',days:[{date,entries:[{id:'skill-a',adoptions:1}]}]}}});
  assert.equal(elements.filter(e=>e.tag==='select').length,1); // Year only.
  const caption=elements.find(e=>e.className==='activity-caption');
  assert.equal(caption.hidden,true);
  assert.equal(caption.textContent,'');
  assert.ok(elements.some(e=>e.tag==='h2'&&e.textContent==='插件工具调用'));
  assert.ok(elements.some(e=>e.tag==='p'&&e.textContent?.includes('2 次工具调用尝试')));
  elements.find(e=>e.tag==='button'&&e.textContent==='Skill').listeners.click();
  assert.equal(elements.filter(e=>e.tag==='select').length,1);
  assert.ok(elements.some(e=>e.tag==='h2'&&e.textContent==='Skill 采用次数'));
  assert.equal(caption.hidden,true);
  assert.equal(caption.textContent,'');
  assert.ok(elements.some(e=>e.tag==='p'&&e.textContent?.includes('1 次采用')));
  elements.find(e=>e.tag==='button'&&e.textContent==='插件').listeners.click();
  assert.equal(elements.filter(e=>e.tag==='select').length,1);
  assert.ok(elements.some(e=>e.tag==='h2'&&e.textContent==='插件工具调用'));
  assert.ok(elements.some(e=>e.tag==='p'&&e.textContent?.includes('2 次工具调用尝试')));
  render.setLocale('en');
  assert.ok(elements.some(e=>e.tag==='h2'&&e.textContent==='Plugin tool calls'));
  assert.ok(elements.some(e=>e.tag==='p'&&e.textContent?.includes('2 recorded tool call attempts')));
  assert.equal(elements.find(e=>e.tag==='select').value,String(new Date().getFullYear()));
  render.setLocale('zh');
  assert.ok(elements.some(e=>e.tag==='h2'&&e.textContent==='插件工具调用'));
  const ranking=elements.find(e=>e.className==='activity-rankings');
  const visibleText=e=>[e.textContent||'',...e.children.map(visibleText)].join(' ');
  const [from,to]=elements.filter(e=>e.tag==='input');
  const excludedDay=date.endsWith('01-01') ? `${date.slice(0,4)}-01-02` : `${date.slice(0,4)}-01-01`;
  from.value=excludedDay; to.value=excludedDay; from.listeners.change();
  assert.ok(!visibleText(ranking).includes('2 次'), 'Top 5 must use the same selected range as the grid');
  assert.ok(visibleText(ranking).includes('当前范围没有符合条件的项目。'));
  from.value=date; to.value=date; from.listeners.change();
  assert.ok(visibleText(ranking).includes('2 次'));
  from.value=`${date.slice(0,4)}-12-31`; to.value=`${date.slice(0,4)}-01-01`; from.listeners.change();
  assert.equal(ranking.hidden,true);
  from.value=date; to.value=date; from.listeners.change();
  render({skills:[],pluginCalls:null,adoptions:null});
  assert.equal(caption.hidden,false);
  assert.ok(elements.some(e=>e.textContent==='插件调用记录暂不可读取。'));
  assert.equal(elements.find(e=>e.className==='entity-panel').children[1].textContent,'统计暂不可读取，不将失败当作零。');
});
