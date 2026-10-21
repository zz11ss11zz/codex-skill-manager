import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const run = promisify(execFile);
const root = fileURLToPath(new URL('..', import.meta.url));
const name = 'codex-skill-manager';
const entry = fileURLToPath(new URL('../src/server.mjs', import.meta.url));
const normalize = value => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);

export async function setup(action, { cli = process.env.CODEX_SKILL_MANAGER_CLI || 'codex', env = process.env, build = true } = {}) {
  if (!['check', 'install', 'uninstall'].includes(action)) throw new Error('用法：node scripts/setup.mjs check|install|uninstall');
  const command = async args => (await run(cli, args, { env, windowsHide: true, timeout: 30000, maxBuffer: 4 * 1024 * 1024, encoding: 'utf8' })).stdout;
  const inspect = async () => {
    const list = JSON.parse(await command(['mcp', 'list', '--json']));
    if (!Array.isArray(list)) throw new Error('Codex CLI 返回了不支持的注册清单格式');
    return list.find(item => item.name === name) || null;
  };
  const matches = item => item?.transport?.type === 'stdio' && typeof item.transport.command === 'string' && normalize(item.transport.command) === normalize(process.execPath) && Array.isArray(item.transport.args) && item.transport.args.length === 1 && typeof item.transport.args[0] === 'string' && normalize(item.transport.args[0]) === normalize(entry);
  const existing = await inspect();
  if (action === 'check') return { action, registered: !!existing, matches: matches(existing), enabled: existing?.enabled ?? null, entry };
  if (existing && !matches(existing)) throw new Error('同名 MCP 注册指向其他命令或目录，未覆盖或移除。请先核对 codex mcp get codex-skill-manager。');
  if (action === 'install') {
    if (build) await run(process.execPath, [path.join(root, 'scripts', 'build.mjs')], { cwd: root, env, windowsHide: true, timeout: 30000 });
    await access(path.join(root, 'dist', 'dashboard.html'));
    if (!existing) await command(['mcp', 'add', name, '--', process.execPath, entry]);
    const installed = await inspect();
    if (!matches(installed)) throw new Error('安装后的注册核对未通过，请检查配置');
    return { action, status: existing ? 'already-registered' : 'installed', enabled: installed.enabled, entry, restartRequired: true };
  }
  if (existing) await command(['mcp', 'remove', name]);
  if (await inspect()) throw new Error('卸载后的注册核对未通过，请检查配置');
  return { action, status: existing ? 'uninstalled' : 'already-absent', preserved: ['project files', '.local usage index', 'skill-manager-archive'], restartRequired: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(JSON.stringify(await setup(process.argv[2] || 'check'), null, 2)); }
  catch (error) {
    console.error(error.code ? `安装操作未完成（${error.code}）。请检查 Codex CLI 路径、权限和配置环境。` : error.message);
    process.exitCode = 1;
  }
}
