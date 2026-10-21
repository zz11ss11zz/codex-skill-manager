import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);

export function parsePluginList(raw) {
  const data = JSON.parse(raw);
  if (!Array.isArray(data.installed)) throw new Error('插件清单格式不受支持');
  return data.installed.map(p => {
    if (typeof p.pluginId !== 'string' || typeof p.version !== 'string' || p.installed !== true || !['boolean', 'undefined'].includes(typeof p.enabled)) throw new Error('插件清单字段不受支持');
    return { id: p.pluginId, version: p.version, enabled: p.enabled ?? null };
  });
}

export async function loadPluginStatus() {
  const { stdout } = await run(process.env.CODEX_SKILL_MANAGER_CLI || 'codex', ['plugin', 'list', '--json'], { timeout: 30000, maxBuffer: 4 * 1024 * 1024, windowsHide: true, encoding: 'utf8' });
  return { checkedAt: new Date().toISOString(), evidence: 'codex plugin list --json', plugins: parsePluginList(stdout) };
}

export function applyPluginStatus(inventory, status) {
  const skills = inventory.skills.map(skill => {
    if (!skill.owner) return skill;
    const id = `${skill.owner.directory || skill.owner.name}@${skill.owner.marketplace}`;
    const records = status.plugins.filter(p => p.id === id);
    const matches = records.filter(p => p.version === skill.owner.version);
    const pluginStatus = { id, evidence: status.evidence, checkedAt: status.checkedAt, installedVersions: records.map(p => p.version), enabled: matches.length === 1 ? matches[0].enabled : null };
    const state = matches.length === 1
      ? `所属插件同版本已安装，${matches[0].enabled === true ? '插件已启用' : matches[0].enabled === false ? '插件已停用' : '插件启用状态未知'}；技能是否被本次会话加载未核实`
      : records.length ? '所属插件其他版本已安装；此文件仍为缓存候选' : '安装清单未匹配；此文件仍为缓存候选';
    return { ...skill, state, pluginStatus };
  });
  return { ...inventory, skills, pluginRegistry: status };
}
