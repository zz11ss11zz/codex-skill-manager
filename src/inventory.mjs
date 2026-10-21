import { readdir, lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { parse } from 'yaml';

const MAX_FILE = 1024 * 1024;
const digest = value => createHash('sha256').update(value).digest('hex');
const inside = (root, target) => { const rel = path.relative(root, target); return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel)); };

export function compareInstances(skills) {
  const fingerprints = new Map(), names = new Map();
  for (const skill of skills) {
    for (const [map, key] of [[fingerprints, skill.fingerprint], [names, skill.name]]) {
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(skill);
    }
  }
  return {
    identicalDocuments: [...fingerprints.values()].filter(group => group.length > 1).map(group => ({ fingerprint: group[0].fingerprint, ids: group.map(s => s.id) })),
    nameConflicts: [...names.entries()].filter(([, group]) => new Set(group.map(s => s.fingerprint)).size > 1).map(([name, group]) => ({ name, ids: group.map(s => s.id) })),
  };
}

export function defaultRoots() {
  const home = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  return { skills: path.join(home, 'skills'), agentSkills: path.join(os.homedir(), '.agents', 'skills'), cache: path.join(home, 'plugins', 'cache') };
}

export async function scanInventory(roots = defaultRoots()) {
  const skills = [], issues = [], coverage = [];
  const issue = (file, reason) => issues.push({ path: file, reason });
  async function entries(dir) {
    try {
      if ((await lstat(dir)).isSymbolicLink()) { issue(dir, '跳过符号链接目录'); return []; }
      return await readdir(dir, { withFileTypes: true });
    }
    catch (error) { issue(dir, error.code === 'ENOENT' ? '目录不存在' : `无法读取目录：${error.code}`); return []; }
  }
  async function safeText(file, boundary) {
    const info = await lstat(file);
    if (info.isSymbolicLink() || !info.isFile()) throw new Error('不读取符号链接或非普通文件');
    if (info.size > MAX_FILE) throw new Error('文件超过 1 MiB 限制');
    if (!inside(await realpath(boundary), await realpath(file))) throw new Error('路径超出扫描根目录');
    return readFile(file, 'utf8');
  }
  async function skillAt(dir, source, boundary, owner = null) {
    const file = path.join(dir, 'SKILL.md');
    let raw;
    try { raw = await safeText(file, boundary); }
    catch (error) { if (error.code !== 'ENOENT') issue(file, error.message); return; }
    const match = raw.replace(/^\uFEFF/, '').match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
    let meta = {};
    try {
      if (!match) throw new Error('缺少 YAML frontmatter');
      meta = parse(match[1], { maxAliasCount: 20 });
      if (!meta || typeof meta !== 'object' || typeof meta.name !== 'string' || typeof meta.description !== 'string') throw new Error('name 或 description 不是字符串');
    } catch (error) { issue(file, `技能元数据无效：${error.message}`); meta = {}; }
    skills.push({
      id: digest(path.resolve(file)), path: file,
      name: meta.name || path.basename(dir), description: meta.description || '元数据无效，请查看扫描问题。',
      source, state: owner ? '缓存候选，安装/启用状态未核实' : '本地存在，启用状态未核实',
      fingerprint: digest(raw), owner, evidence: '本地 SKILL.md 文件',
    });
  }
  async function skillRoot(root, source, owner = null) {
    coverage.push({ path: root, source });
    for (const entry of await entries(root)) {
      if (entry.name.startsWith('.')) continue;
      const target = path.join(root, entry.name);
      if (entry.isSymbolicLink()) { issue(target, '跳过符号链接，避免越界或重复扫描'); continue; }
      if (entry.isDirectory()) await skillAt(target, source, root, owner);
    }
  }
  await skillRoot(roots.skills, '用户技能');
  await skillRoot(path.join(roots.skills, '.system'), '系统技能');
  if (roots.agentSkills) await skillRoot(roots.agentSkills, '用户 .agents 技能');
  coverage.push({ path: roots.cache, source: '插件缓存（不等于安装清单）' });
  for (const market of await entries(roots.cache)) {
    if (!market.isDirectory() || market.isSymbolicLink()) continue;
    const marketPath = path.join(roots.cache, market.name);
    for (const plugin of await entries(marketPath)) {
      if (!plugin.isDirectory() || plugin.isSymbolicLink()) continue;
      const pluginPath = path.join(marketPath, plugin.name);
      for (const version of await entries(pluginPath)) {
        if (!version.isDirectory() || version.isSymbolicLink()) continue;
        const versionPath = path.join(pluginPath, version.name);
        let manifest = null, manifestPath = null, portable = false;
        for (const relative of ['plugin.json', '.codex-plugin/plugin.json']) {
          try { manifestPath = path.join(versionPath, relative); manifest = JSON.parse(await safeText(manifestPath, roots.cache)); portable = relative === 'plugin.json'; break; }
          catch (error) { if (error.code !== 'ENOENT') issue(manifestPath, `manifest 无法读取：${error.message}`); }
        }
        if (!manifest) { issue(versionPath, '缺少有效插件 manifest，未推断技能归属'); continue; }
        if (manifest.skills === undefined) {
          try { await lstat(path.join(versionPath, 'skills')); }
          catch (error) { if (error.code === 'ENOENT') continue; issue(versionPath, `无法检查技能目录：${error.code}`); continue; }
        }
        const declared = portable ? './skills' : (manifest.skills ?? './skills');
        const locations = Array.isArray(declared) ? declared : [declared];
        for (const location of locations) {
          if (typeof location !== 'string') { issue(manifestPath, '不支持的 skills 字段'); continue; }
          const root = path.resolve(versionPath, location);
          if (!inside(versionPath, root)) { issue(manifestPath, 'skills 路径超出插件目录'); continue; }
          await skillRoot(root, '插件缓存技能', { name: typeof manifest.name === 'string' ? manifest.name : plugin.name, marketplace: market.name, version: version.name, manifest: manifestPath });
        }
      }
    }
  }
  skills.sort((a, b) => a.path.localeCompare(b.path));
  return { mode: 'inventory', scannedAt: new Date().toISOString(), coverage, skills, issues, comparisons: compareInstances(skills), usage: null,
    limits: ['仅扫描标准技能根目录的直接子目录；不递归扫描示例。', '符号链接跳过并记录。', '插件缓存不证明安装或启用；未解析项目技能、启停配置与使用日志。'] };
}
