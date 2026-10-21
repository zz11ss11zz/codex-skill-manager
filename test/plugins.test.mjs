import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePluginList, applyPluginStatus } from '../src/plugins.mjs';

test('plugin list retains only required fields and rejects partial or malformed records', () => {
  assert.deepEqual(parsePluginList(JSON.stringify({ installed: [{ pluginId: 'demo@market', version: '2', installed: true, enabled: false, source: { path: 'private' } }] })), [{ id: 'demo@market', version: '2', enabled: false }]);
  assert.throws(() => parsePluginList('{}'));
  assert.throws(() => parsePluginList('{'));
  assert.throws(() => parsePluginList('{"installed":[{"pluginId":"demo","installed":true}]}'));
});

test('join uses marketplace, directory identity and version; absence is not uninstall evidence', () => {
  const make = (version, marketplace = 'market') => ({ owner: { name: 'Display Name', directory: 'demo', marketplace, version }, state: 'candidate' });
  const inventory = { skills: [make('2'), make('1'), make('2', 'other'), { state: 'local' }] };
  const status = { checkedAt: '2026-01-01T00:00:00Z', evidence: 'synthetic', plugins: [{ id: 'demo@market', version: '2', enabled: false }] };
  const result = applyPluginStatus(inventory, status);
  assert.match(result.skills[0].state, /插件已停用/);
  assert.match(result.skills[1].state, /其他版本/);
  assert.match(result.skills[2].state, /未匹配/);
  assert.equal(result.skills[3].state, 'local');
  assert.equal(inventory.skills[0].state, 'candidate');
  assert.match(applyPluginStatus(inventory, { ...status, plugins: [] }).skills[0].state, /未匹配/);
});
