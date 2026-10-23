import path from 'node:path';
import os from 'node:os';

export function dataDirectory(env = process.env, home = os.homedir()) {
  if (env.CODEX_SKILL_MANAGER_DATA_DIR) {
    if (!path.isAbsolute(env.CODEX_SKILL_MANAGER_DATA_DIR)) throw new Error('CODEX_SKILL_MANAGER_DATA_DIR 必须是绝对路径');
    return path.normalize(env.CODEX_SKILL_MANAGER_DATA_DIR);
  }
  const codexHome = env.CODEX_HOME || path.join(home, '.codex');
  if (!path.isAbsolute(codexHome)) throw new Error('CODEX_HOME 必须是绝对路径');
  return path.join(codexHome, 'skill-manager', 'data-v1');
}

export const dataFile = name => path.join(dataDirectory(), name);
