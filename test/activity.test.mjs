import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeActivity, activityView, activityCoverage, calendarDays } from '../src/activity.mjs';
import { aggregateUsage } from '../src/usage.mjs';
const skill = (id, owner) => ({ id, name: id, path: `/skills/${id}/SKILL.md`, source: '用户技能', owner });
const coverage = { from: '2026-01-01T00:00:00Z', to: '2026-12-31T23:59:59Z', pendingBytes: 0, issues: [] };

test('calendar and entity grids share coverage, exclude unknown zeros and respect query bounds', () => {
  const usage={activity:{timeZone:'Asia/Shanghai',days:[]},coverage:{...coverage,from:'2026-10-21T02:00:00Z',to:'2026-10-22T03:00:00Z'},
    period:{from:'2026-10-20T16:00:00Z',to:'2026-10-21T16:00:00Z'}};
  const c=activityCoverage(usage,2026,{},Date.parse('2026-10-23T00:00:00Z'));
  assert.equal(c.effectiveFrom,'2026-10-21'); assert.equal(c.effectiveTo,'2026-10-21'); assert.equal(c.partial,true);
  const inventory={skills:[skill('a')],usage};
  const before=activityView(inventory,'skills',2026,'adoptions',{from:'2026-10-19',to:'2026-10-20'});
  assert.equal(before.all[0].unknown,true); assert.equal(before.unused.length,0);
  const covered=activityView(inventory,'skills',2026,'adoptions',{from:'2026-10-21',to:'2026-10-21'});
  assert.equal(covered.all[0].unknown,false); assert.equal(covered.unused.length,1);
  const broken=activityView({...inventory,usage:{...usage,coverage:{...usage.coverage,pendingBytes:1}}},'skills',2026,'adoptions');
  assert.equal(broken.all[0].unknown,true); assert.equal(broken.unused.length,0);
  const missing=activityView({...inventory,usage:null},'skills',2026,'adoptions');
  assert.equal(missing.ready,false); assert.equal(missing.coverage.hasOverlap,false);
});

test('adoption counts stay separate from historical signals and removed skills are not unused', () => {
  const inventory = { skills: [skill('a'), skill('unused'), {...skill('removed'), historical:true}], usage: {coverage, activity: {days:[{date:'2026-04-01',entries:[{id:'a',adoptions:3,reads:9,explicit:1}]}]}}};
  assert.equal(activityView(inventory,'skills',2026,'adoptions').total,3);
  assert.equal(activityView(inventory,'skills',2026,'reads').total,9);
  assert.deepEqual(activityView(inventory,'skills',2026,'adoptions').unused.map(e=>e.id),['unused']);
});
test('daily summaries retain all evidence, split signals and use requested timezone across midnight', () => {
  const skills = [skill('a')];
  const events = Array.from({length: 150}, (_, i) => ({ key: String(i), kind: 'read-request', reference: skills[0].path, timestamp: '2026-01-01T20:00:00Z', source: 'log', line: i }));
  const result = aggregateUsage(events, skills, {timeZone:'Asia/Shanghai'});
  assert.equal(result.activity.days[0].date, '2026-01-02');
  assert.equal(result.activity.days[0].entries[0].reads, 150);
  assert.equal(result.activity.days[0].entries[0].explicit, 0);
  assert.throws(() => aggregateUsage(events, skills, {timeZone:'Invalid/Zone'}));
});
test('plugin ranking aggregates owners; caches, ambiguous attribution and incomplete coverage are not unused', () => {
  const owner = {name:'demo', directory:'demo', marketplace:'market', version:'1'};
  const skills = [skill('a', owner), skill('b',owner), skill('unused'), skill('uncertain'), skill('cached', {...owner,name:'cache',directory:'cache'})];
  const activity = summarizeActivity([{resolution:'resolved',candidateIds:['a'],kind:'read-request',timestamp:'2026-04-01T12:00:00Z'}, {resolution:'resolved',candidateIds:['b'],kind:'read-request',timestamp:'2026-04-01T12:00:00Z'}, {resolution:'ambiguous',candidateIds:['uncertain'],kind:'explicit-marker',timestamp:null}]);
  const inventory = {skills, pluginRegistry:{plugins:[{id:'demo@market',version:'1'}]}, usage:{activity,coverage}};
  assert.equal(activityView(inventory,'plugins',2026).top[0].total, 2);
  assert.deepEqual(activityView(inventory,'skills',2026,'explicit').unused.map(e=>e.id), ['unused']);
  assert.deepEqual(activityView(inventory,'skills',2026).unused.map(e=>e.id), ['unused']);
  assert.equal(activityView(inventory,'skills',2025).unused.length, 0);
  assert.equal(activityView({...inventory,usage:{activity,coverage:{...coverage,pendingBytes:1}}},'skills',2026).unused.length, 0);
  assert.equal(activityView({skills},'skills',2026).unused.length, 0);
});
test('both lists cap at five with stable ties; calendar includes leap day and aligned weeks', () => {
  const skills = Array.from({length:12}, (_,i)=>skill(`skill-${i}`));
  const activity = summarizeActivity(skills.slice(0,6).map(s=>({resolution:'resolved',candidateIds:[s.id],kind:'read-request',timestamp:'2026-04-01T00:00:00Z'})));
  const inventory = {skills, usage:{activity,coverage}};
  assert.equal(activityView(inventory,'skills',2026).top.length,5);
  assert.equal(activityView(inventory,'skills',2026).unused.length,5);
  assert.deepEqual(activityView(inventory,'skills',2026).top,activityView({...inventory,skills:[...skills].reverse()},'skills',2026).top);
  assert.equal(calendarDays(2024).filter(Boolean).length,366);
  assert.ok(calendarDays(2024).includes('2024-02-29'));
  assert.equal(calendarDays(2026).length % 7,0);
});

test('entity heatmap ranks every item and filters inclusive date bounds before plugin aggregation', () => {
  const owner = {name:'demo', directory:'demo', marketplace:'market', version:'1'};
  const skills = [skill('a',owner), skill('b',owner), ...Array.from({length:7},(_,i)=>skill(`zero-${i}`))];
  const inventory = {skills,usage:{coverage,activity:{days:[
    {date:'2026-04-01',entries:[{id:'a',adoptions:10}]},
    {date:'2026-04-02',entries:[{id:'a',adoptions:2},{id:'b',adoptions:4}]},
    {date:'2026-04-03',entries:[{id:'a',adoptions:1}]},
    {date:'2026-04-04',entries:[{id:'a',adoptions:20}]}
  ]}}};
  const range = {from:'2026-04-02',to:'2026-04-03'};
  const view = activityView(inventory,'skills',2026,'adoptions',range);
  assert.equal(view.all.length,9);
  assert.deepEqual(view.all.slice(0,2).map(e=>[e.id,e.total]),[['b',4],['a',3]]);
  assert.equal(view.total,7);
  assert.equal(activityView(inventory,'plugins',2026,'adoptions',range).all[0].total,7);
  assert.equal(activityView(inventory,'skills',2026,'adoptions',{from:'2026-04-02',to:'2026-04-02'}).total,6);
  assert.deepEqual(activityView({skills},'skills',2026).all,[]);
});
