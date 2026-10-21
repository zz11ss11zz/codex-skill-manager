const stop = new Set('a an the this that these those and or for from with to of in on by as is are be when use used using users user skill skills tool tools can should only 使用 用于 用户 技能 工具 可以 进行 需要 一个 以及 如果'.split(' '));
const segmenter = new Intl.Segmenter('zh', { granularity: 'word' });
function terms(description) {
  const words = new Set();
  for (const part of segmenter.segment(description.slice(0, 8000).normalize('NFKC').toLowerCase())) {
    const word = part.segment;
    if (part.isWordLike && word.length >= 2 && /\p{L}/u.test(word) && !stop.has(word)) words.add(word);
    if (words.size >= 500) break;
  }
  return words;
}

// Local lexical retrieval only. The score is a term overlap ratio, not a probability.
export function descriptionOverlap(skills) {
  const candidates = skills.filter(s => typeof s.description === 'string' && s.description !== '元数据无效，请查看扫描问题。');
  const scope = [...candidates].sort((a, b) => a.id.localeCompare(b.id)).slice(0, 500);
  const tokenSets = scope.map(s => terms(s.description)), pairs = [];
  for (let i = 0; i < scope.length; i++) for (let j = i + 1; j < scope.length; j++) {
    if (scope[i].fingerprint === scope[j].fingerprint || scope[i].name === scope[j].name) continue;
    const left = tokenSets[i], right = tokenSets[j];
    const shared = [...left].filter(word => right.has(word));
    const union = left.size + right.size - shared.length;
    const ratio = union ? shared.length / union : 0;
    if (shared.length < 3 || ratio < 0.3) continue;
    pairs.push({ ids: [scope[i].id, scope[j].id], ratio, sharedTerms: shared.sort().slice(0, 12), sharedCount: shared.length });
  }
  pairs.sort((a, b) => b.ratio - a.ratio || a.ids.join(':').localeCompare(b.ids.join(':')));
  return { pairs: pairs.slice(0, 50), totalPairs: pairs.length, comparedInstances: scope.length, eligibleInstances: candidates.length,
    limits: ['仅以描述词语交并比筛选用途重叠候选，不作语义等价判断；比例不是置信度。', '至少 3 个共同词，交并比至少 0.30；同名或相同文档由其他分组展示。', '最多比较按实例 ID 排序的 500 项，每份描述前 8000 字符、最多 500 个词；显示前 50 对。', '否定条件、依赖和适用范围仍需人工核对；无候选不表示不存在重叠，不支持自动删除。'] };
}
