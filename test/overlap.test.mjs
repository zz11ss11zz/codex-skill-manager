import test from 'node:test';
import assert from 'node:assert/strict';
import { descriptionOverlap } from '../src/overlap.mjs';
const skill = (id, description) => ({ id, name: id, fingerprint: id, description });
test('description candidates expose common terms, preserve differences and exclude unrelated or generic text', () => {
  const input = [skill('a', 'Create scientific charts and compare experimental data'), skill('b', 'Compare scientific charts with experimental data'), skill('c', 'Manage calendar meetings and email invitations'), skill('d', 'Use this skill when the user needs a tool')];
  const result = descriptionOverlap(input);
  assert.equal(result.totalPairs, 1);
  assert.deepEqual(result.pairs[0].ids, ['a', 'b']);
  assert.ok(result.pairs[0].sharedTerms.includes('scientific'));
  assert.ok(result.pairs[0].ratio > 0.3);
  assert.deepEqual(descriptionOverlap([...input].reverse()), result);
  assert.equal(descriptionOverlap([input[0], { ...input[1], fingerprint: 'a' }]).totalPairs, 0);
  assert.equal(descriptionOverlap([input[0], { ...input[1], name: 'a' }]).totalPairs, 0);
});
test('Chinese descriptions and bounded candidate output retain explicit coverage', () => {
  const result = descriptionOverlap([skill('a', '科学 数据 图表 绘制 分析'), skill('b', '科学 数据 图表 绘制 导出')]);
  assert.equal(result.totalPairs, 1);
  assert.ok(result.pairs[0].sharedTerms.includes('图表'));
  const many = descriptionOverlap(Array.from({ length: 501 }, (_, i) => skill(String(i).padStart(3, '0'), 'scientific charts experimental data')));
  assert.equal(many.comparedInstances, 500);
  assert.equal(many.eligibleInstances, 501);
  assert.equal(many.pairs.length, 50);
  assert.equal(many.totalPairs, 500 * 499 / 2);
});
