import test from 'node:test';
import assert from 'node:assert/strict';
import { UsageParser, aggregateUsage, readCommands, skillReadPaths } from '../src/usage.mjs';

const message = (id, text, role = 'user') => ({ type: 'response_item', timestamp: '2026-01-01T00:00:00Z', payload: { type: 'message', id, role, content: [{ type: 'input_text', text }] } });
const read = (id, cmd) => ({ type: 'response_item', timestamp: '2026-01-01T00:01:00Z', payload: { type: 'function_call', name: 'exec_command', call_id: id, arguments: JSON.stringify({ cmd }) } });
function parser(session = 'one', turn = 'turn') {
  const p = new UsageParser();
  p.accept({ type: 'session_meta', payload: { id: session, cwd: 'D:/skills' } }, 'log', 1);
  p.accept({ type: 'turn_context', payload: { turn_id: turn } }, 'log', 2);
  return p;
}
const skills = [{ id: 'a', name: 'demo', path: 'D:/skills/demo/SKILL.md' }, { id: 'b', name: 'same', path: '/other/SKILL.md' }, { id: 'c', name: 'same', path: '/third/SKILL.md' }];

test('only plain user markers become intent signals; quotes, code, outputs and compacted history excluded', () => {
  const p = parser();
  const signals = p.accept(message('m', 'Use $demo and $demo.\n> quoted $no\n`$code`\n```\n$block\n```\n~~~\n$tilde\n~~~'), 'log', 3);
  assert.deepEqual(signals.map(e => e.reference), ['demo']);
  assert.equal(p.accept(message('a', '$demo', 'assistant'), 'log', 4).length, 0);
  assert.equal(p.accept({ type: 'compacted', payload: { replacement_history: [message('m', '$demo')] } }, 'log', 5).length, 0);
  assert.equal(p.accept({ type: 'event_msg', payload: { type: 'item_completed', item: message('m', '$demo').payload } }, 'log', 6).length, 0);
  assert.equal(p.accept({ type: 'response_item', payload: { type: 'function_call_output', output: '$demo' } }, 'log', 7).length, 0);
  assert.ok(!JSON.stringify(signals).includes('Use '));
  p.accept({ type: 'session_meta', payload: { id: { private: 'payload' }, cwd: { private: 'payload' } } }, 'log', 8);
  const malformedMetadata = p.accept(message('', '$demo'), 'log', 9);
  assert.equal(malformedMetadata[0].session, null);
  assert.equal(malformedMetadata[0].identity, 'source-line');
  assert.ok(!JSON.stringify(malformedMetadata).includes('private'));
});

test('read commands are parsed without executing code and dynamic/audit-only mentions are ignored', () => {
  const p = { type: 'custom_tool_call', name: 'exec', input: 'const r = await tools.exec_command({cmd: "Get-Content demo/SKILL.md"}); text(r);' };
  assert.equal(readCommands(p).length, 1);
  assert.equal(readCommands({ ...p, input: 'await Promise.all([tools.exec_command({cmd:"cat /a/SKILL.md"}), tools.exec_command({cmd:"cat /b/SKILL.md"})]);' }).length, 2);
  for (const input of ['function unused(){ tools.exec_command({cmd:"cat /x/SKILL.md"}); }', 'if (false) tools.exec_command({cmd:"cat /x/SKILL.md"});', 'await tools.exec_command({cmd: command});', 'text("cat /x/SKILL.md")']) assert.equal(readCommands({ ...p, input }).length, 0);
  assert.deepEqual(skillReadPaths('Get-Content -LiteralPath "D:\\中文\\SKILL.md" -TotalCount 20'), ['d:/中文/skill.md']);
  assert.deepEqual(skillReadPaths('cat demo/SKILL.md', '/skills'), ['/skills/demo/SKILL.md']);
  for (const command of ['echo cat /a/SKILL.md', 'cat $file', 'cat /a/SKILL.md; echo hi', 'rg SKILL.md /skills', 'node scan-skills.mjs']) assert.deepEqual(skillReadPaths(command, '/'), []);
});

test('same-turn partial reads and fork replay deduplicate regardless of import order; new turns remain separate', () => {
  const parent = parser(), fork = parser('fork');
  const events = [
    ...parent.accept(read('r1', 'Get-Content demo/SKILL.md -TotalCount 20'), 'parent', 3),
    ...parent.accept(read('r2', 'Get-Content demo/SKILL.md -Tail 20'), 'parent', 4),
    ...fork.accept(read('r2', 'Get-Content demo/SKILL.md -Tail 20'), 'fork', 3),
  ];
  assert.equal(aggregateUsage(events, skills).counts['read-request'].events, 1);
  assert.equal(aggregateUsage([...events].reverse(), skills).counts['read-request'].events, 1);
  assert.equal(aggregateUsage([...events, ...events], skills).counts['read-request'].events, 1);
  const next = parser('one', 'next');
  assert.equal(aggregateUsage([...events, ...next.accept(read('r3', 'Get-Content demo/SKILL.md'), 'parent', 5)], skills).counts['read-request'].events, 2);
});

test('ambiguous and unknown references are preserved; intent and inferred requests stay separate', () => {
  const p = parser();
  const events = [...p.accept(message('m', '$demo $same $missing'), 'log', 3), ...p.accept(read('r', 'Get-Content demo/SKILL.md'), 'log', 4)];
  const result = aggregateUsage(events, skills);
  assert.equal(result.counts['explicit-marker'].events, 3);
  assert.equal(result.counts['read-request'].events, 1);
  assert.equal(result.events.find(e => e.reference === 'same').resolution, 'ambiguous');
  assert.equal(result.events.find(e => e.reference === 'missing').resolution, 'unresolved');
  assert.equal(result.counts['explicit-marker'].resolvedInstances, 1);
  assert.equal(result.counts['read-request'].resolvedInstances, 1);
});

test('generated review sessions and shell syntax do not become human invocation signals', () => {
  const p = parser();
  p.accept({type:'session_meta', payload:{id:'review',source:{subagent:{other:'guardian'}}}}, 'log', 1);
  assert.deepEqual(p.accept(message('review', '$demo $env:PATH $reportText.Replace'), 'log', 2), []);
  assert.deepEqual(p.accept(read('review-read', 'cat /skills/demo/SKILL.md'), 'log', 3), []);
  const restored = new UsageParser();
  Object.assign(restored, {excludedSession:p.excludedSession});
  assert.deepEqual(restored.accept(message('next', '$demo'), 'log', 4), []);
  const human = parser();
  const text = 'Use $demo. $plugin:tool $env:PATH $false $reportText.Replace $f.json $x = 1; $reportText=2';
  assert.deepEqual(human.accept(message('human',text),'log',5).map(e=>e.reference), ['demo','plugin:tool']);
  const review = message('wrapped','The following is the Codex agent history whose request action you are assessing.');
  review.payload.content.push({type:'input_text',text:'tool: $demo'});
  assert.deepEqual(human.accept(review,'log',6), []);
  assert.deepEqual(human.accept(message('context','<codex_internal_context>$demo</codex_internal_context>'),'log',7), []);
});

test('unknown timestamps remain in all-time counts but are excluded from bounded periods', () => {
  const p=parser(); const record=message('unknown','$demo'); delete record.timestamp;
  const events=p.accept(record,'log',1);
  assert.equal(aggregateUsage(events,skills).counts['explicit-marker'].events,1);
  assert.equal(aggregateUsage(events,skills,{from:'2026-01-01T00:00:00Z'}).counts['explicit-marker'].events,0);
});
