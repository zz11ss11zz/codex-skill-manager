// Explicit, isolated acceptance run. Never reads the user's actual logs or changes their Codex config.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile, cp, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { scanInventory } from '../src/inventory.mjs';
import { SkillNotes } from '../src/skill-notes.mjs';
import { Adoptions } from '../src/adoptions.mjs';
import { PluginCalls } from '../src/plugin-calls.mjs';
import { UsageIndex } from '../src/usage-index.mjs';
import { listHostSkills } from './host-skills.mjs';

const run = promisify(execFile), repo = fileURLToPath(new URL('..', import.meta.url));
const packageRoot = path.resolve(process.argv[2] || 'dist/plugin-0.1.0-alpha.0-m2');
await mkdir(path.join(repo, 'work'), { recursive: true });
const root = await mkdtemp(path.join(repo, 'work', 'acceptance-'));
const mcpOnly = process.argv.includes('--mcp-only');
const profile = path.join(root, 'profile'), codexHome = path.join(profile, '.codex');
const market = path.join(root, 'market'), legacy = path.join(root, 'old', '.local');
const persistent = path.join(codexHome, 'skill-manager', 'data-v1');
const files = ['adoptions.json', 'plugin-calls.json', 'skill-notes.json', 'usage-index.json'];
const checks = [], check = name => { checks.push(name); console.log(`PASS ${name}`); };
const env = { ...process.env, USERPROFILE: profile, HOME: profile, CODEX_HOME: codexHome };
delete env.CODEX_SKILL_MANAGER_DATA_DIR; delete env.CODEX_SKILL_MANAGER_LEGACY_DIR;
const cli = async args => (await run(process.env.CODEX_SKILL_MANAGER_CLI || 'codex', args, { cwd: root, env, windowsHide: true, timeout: 30000, maxBuffer: 8 * 1024 * 1024 })).stdout;
const save = async (file, data) => { await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, data); };
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const hashes = async dir => Object.fromEntries(await Promise.all(files.map(async name => [name, digest(await readFile(path.join(dir, name)))])));
const inventoryRoots = { skills: path.join(codexHome, 'skills'), agentSkills: path.join(profile, '.agents', 'skills'), cache: path.join(codexHome, 'plugins', 'cache') };
for (const dir of [inventoryRoots.skills, inventoryRoots.agentSkills, inventoryRoots.cache, legacy, path.join(codexHome, 'archived_sessions')]) await mkdir(dir, { recursive: true });
await save(path.join(inventoryRoots.skills, 'acceptance-demo', 'SKILL.md'), '---\nname: acceptance-demo\ndescription: Synthetic acceptance fixture\n---\nNo real user data.\n');
const skill = (await scanInventory(inventoryRoots)).skills[0]; assert.equal(skill.name, 'acceptance-demo');
const log = path.join(codexHome, 'sessions', 'fixture.jsonl');
const row = id => JSON.stringify({ type: 'response_item', timestamp: '2026-10-23T01:00:00Z', payload: { type: 'message', id, role: 'user', content: [{ type: 'input_text', text: '$acceptance-demo' }] } }) + '\n';
await save(log, row('before-migration'));
await new SkillNotes(path.join(legacy, files[2])).save({ id: skill.id, fingerprint: skill.fingerprint, note: '迁移前验收备注', retain: true, expectedRevision: 0 });
await new Adoptions(path.join(legacy, files[0])).record({ id: 'acceptance_seed_batch_001', skills: ['acceptance-demo', 'acceptance-demo'] }, [skill]);
const call = { id: 'acceptance_seed_call_001', plugin: 'demo', tool: 'mcp__codex_apps__demo_read' };
await new PluginCalls(path.join(legacy, files[1])).record([call]);
await new UsageIndex({ roots: [path.dirname(log)], stateFile: path.join(legacy, files[3]) }).refresh([skill]);
const original = await hashes(legacy);
await cp(packageRoot, path.join(market, 'plugins', 'manager'), { recursive: true, errorOnExist: true, force: false });
await save(path.join(market, '.agents', 'plugins', 'marketplace.json'), JSON.stringify({ name: 'manager-acceptance', plugins: [{ name: 'codex-skill-manager', source: { source: 'local', path: './plugins/manager' }, policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' }, category: 'Productivity' }] }));
let registeredPackage = path.join(market, 'plugins', 'manager');
async function install() {
  if (!mcpOnly) return JSON.parse(await cli(['plugin', 'add', 'codex-skill-manager@manager-acceptance', '--json']));
  await cli(['mcp', 'add', 'manager-acceptance', '--', process.execPath, path.join(registeredPackage, 'server', 'src', 'server.mjs')]);
  const registered = JSON.parse(await cli(['mcp', 'get', 'manager-acceptance', '--json']));
  assert.equal(registered.transport.command, process.execPath);
  assert.deepEqual(registered.transport.args, [path.join(registeredPackage, 'server', 'src', 'server.mjs')]);
  return registered;
}
async function uninstall() {
  if (!mcpOnly) {
    await cli(['plugin', 'remove', 'codex-skill-manager@manager-acceptance', '--json']);
    const list = JSON.parse(await cli(['plugin', 'list', '--json']));
    assert.ok(!list.installed.some(p => p.pluginId === 'codex-skill-manager@manager-acceptance'));
    return;
  }
  await cli(['mcp', 'remove', 'manager-acceptance']);
  assert.ok(!JSON.parse(await cli(['mcp', 'list', '--json'])).some(s => s.name === 'manager-acceptance'));
}
if (!mcpOnly) await cli(['plugin', 'marketplace', 'add', market, '--json']);
const installed = await install();
await save(path.join(root, 'cli-install.json'), JSON.stringify(installed, null, 2));
console.log(`ACCEPTANCE_ROOT ${root}`);
console.log(JSON.stringify(installed));
check(mcpOnly ? 'real CLI MCP registration of standalone package' : 'real CLI marketplace installation');
if (!mcpOnly) {
  const list = JSON.parse(await cli(['plugin', 'list', '--json']));
  const plugin = list.installed.find(p => p.pluginId === 'codex-skill-manager@manager-acceptance');
  assert.equal(plugin?.enabled, true); assert.equal(plugin?.installed, true);
  const discovered = await listHostSkills({ cwd: root, env, cli: process.env.CODEX_SKILL_MANAGER_CLI || 'codex' });
  const entry = discovered.data.flatMap(d => d.skills).find(s => s.pluginId === plugin.pluginId && s.name === 'codex-skill-manager:skill-manager');
  assert.equal(entry?.enabled, true);
  assert.equal(await readFile(entry.path, 'utf8'), await readFile(path.join(packageRoot, 'skills/skill-manager/SKILL.md'), 'utf8'));
  assert.ok(path.resolve(entry.path).startsWith(path.resolve(inventoryRoots.cache) + path.sep));
  await save(path.join(root, 'host-skills.json'), JSON.stringify({ skill: entry, errors: discovered.data.flatMap(d => d.errors) }, null, 2));
  check('real app-server discovers the enabled Skill from installed cache');
}

// Locate the installed cache instead of treating the marketplace source as an install.
async function cachedPackage() {
  if (mcpOnly) return registeredPackage;
  const base = path.join(inventoryRoots.cache, 'manager-acceptance', 'codex-skill-manager');
  const versions = (await readdir(base, { withFileTypes: true })).filter(d => d.isDirectory());
  assert.equal(versions.length, 1);
  return path.join(base, versions[0].name);
}
let current;
async function start(pkg, extra = {}) {
  const config = JSON.parse(await readFile(path.join(pkg, 'mcp.json'))).mcpServers['codex-skill-manager'];
  const substitute = value => value.replaceAll('${PLUGIN_ROOT}', pkg);
  const registered = mcpOnly ? JSON.parse(await cli(['mcp', 'get', 'manager-acceptance', '--json'])).transport : null;
  const transport = new StdioClientTransport({ command: registered?.command || process.execPath, args: registered?.args || config.args.map(substitute), cwd: substitute(config.cwd), env: { ...env, ...extra }, stderr: 'pipe' });
  const client = new Client({ name: 'isolated-acceptance', version: '1' });
  current = { client, transport };
  await client.connect(transport);
  assert.equal(client.getServerVersion().version, JSON.parse(await readFile(path.join(packageRoot, 'plugin.json'))).version);
  return client;
}
async function stop() { if (current) { await current.client.close(); await current.transport.close(); current = null; } }
async function tool(name, args = {}) {
  const result = await current.client.callTool({ name, arguments: args });
  assert.ok(!result.isError, JSON.stringify(result)); return result.structuredContent;
}
try {
  let cached = await cachedPackage();
  await start(cached, { CODEX_SKILL_MANAGER_LEGACY_DIR: legacy });
  const entryTool = (await current.client.listTools()).tools.find(t => t.name === 'open_skill_manager');
  const resource = await current.client.readResource({ uri: entryTool._meta.ui.resourceUri });
  assert.equal(resource.contents[0].text, await readFile(path.join(repo, 'dist/dashboard.html'), 'utf8'));
  await assert.rejects(current.client.readResource({ uri: 'ui://codex-skill-manager/dashboard-0000000000000000.html' }));
  check('installed bundle serves byte-identical UI and rejects unknown revisions');
  assert.deepEqual(await hashes(persistent), original);
  assert.deepEqual(await hashes(path.join(persistent, 'migration-backup')), original);
  let opened = await tool('open_skill_manager');
  assert.equal(opened.adoptions.total, 2); assert.equal(opened.pluginCalls.total, 1);
  assert.equal(opened.usage.counts['explicit-marker'].events, 1);
  assert.equal(opened.skills.find(s => s.id === skill.id).annotation.note, '迁移前验收备注');
  check('installed packaged service migrates and reads all four stores');
  await tool('save_skill_note', { id: skill.id, fingerprint: skill.fingerprint, note: '升级后验收备注', retain: true, expectedRevision: 1 });
  await tool('record_skill_use', { id: 'acceptance_new_batch_002', skills: ['acceptance-demo', 'acceptance-demo'] });
  await tool('record_plugin_calls', { calls: [{ ...call, id: 'acceptance_new_call_002' }] });
  await save(log, row('before-migration') + row('after-migration'));
  await tool('import_usage');
  await stop();
  await start(cached);
  opened = await tool('open_skill_manager');
  assert.equal(opened.adoptions.total, 4); assert.equal(opened.pluginCalls.total, 2);
  assert.equal(opened.usage.counts['explicit-marker'].events, 2);
  assert.equal(opened.skills.find(s => s.id === skill.id).annotation.note, '升级后验收备注');
  check('restart retains added notes, repeated adoptions, calls and imported signals');
  // Real error path: malformed data must be unavailable, never zero.
  const ledger = path.join(persistent, files[1]), ledgerBytes = await readFile(ledger);
  await writeFile(ledger, '{broken');
  opened = await tool('open_skill_manager'); assert.equal(opened.pluginCalls, null);
  assert.ok(opened.issues.some(i => i.reason.includes('插件调用记录无法读取')));
  await writeFile(ledger, ledgerBytes);
  const badNote = await current.client.callTool({ name: 'save_skill_note', arguments: { id: skill.id, fingerprint: skill.fingerprint, note: 'stale', retain: false, expectedRevision: 0 } });
  assert.equal(badNote.isError, true);
  check('corruption remains unavailable and stale note updates are rejected');
  await stop();
  const updated = await hashes(persistent);
  await cp(persistent, path.join(root, 'stopped-backup'), { recursive: true, errorOnExist: true, force: false });
  if (!mcpOnly) {
    await install();
    cached = await cachedPackage();
    await start(cached); opened = await tool('open_skill_manager');
    assert.equal(opened.adoptions.total, 4); assert.equal(opened.pluginCalls.total, 2);
    assert.deepEqual(await hashes(persistent), updated); await stop();
    check('same-version marketplace replacement retains data and starts successfully');
  }
  await uninstall();
  assert.deepEqual(await hashes(persistent), updated);
  check('real CLI uninstall preserves independent data');
  // Simulate an upgrade relocated to a new source and installed cache.
  await cp(packageRoot, path.join(market, 'plugins', 'next manager'), { recursive: true, errorOnExist: true, force: false });
  const catalogFile = path.join(market, '.agents', 'plugins', 'marketplace.json');
  const catalog = JSON.parse(await readFile(catalogFile)); catalog.plugins[0].source.path = './plugins/next manager';
  await writeFile(catalogFile, JSON.stringify(catalog));
  registeredPackage = path.join(market, 'plugins', 'next manager');
  await install();
  cached = await cachedPackage();
  await start(cached); opened = await tool('open_skill_manager');
  assert.equal(opened.adoptions.total, 4); assert.equal(opened.pluginCalls.total, 2);
  assert.equal(opened.usage.counts['explicit-marker'].events, 2);
  assert.equal(opened.skills.find(s => s.id === skill.id).annotation.note, '升级后验收备注');
  assert.deepEqual(await hashes(persistent), updated); await stop();
  check('relocated package reinstall retains all new data');
  const rollback = path.join(root, 'rollback');
  await start(cached, { CODEX_SKILL_MANAGER_DATA_DIR: rollback, CODEX_SKILL_MANAGER_LEGACY_DIR: path.join(persistent, 'migration-backup') });
  opened = await tool('open_skill_manager');
  assert.equal(opened.adoptions.total, 2); assert.equal(opened.pluginCalls.total, 1);
  assert.equal(opened.usage.counts['explicit-marker'].events, 1);
  assert.equal(opened.skills.find(s => s.id === skill.id).annotation.note, '迁移前验收备注');
  assert.deepEqual(await hashes(persistent), updated); await stop();
  check('snapshot rollback restores original values without overwriting current data');
  await start(cached, { CODEX_SKILL_MANAGER_DATA_DIR: path.join(root, 'restore-latest'), CODEX_SKILL_MANAGER_LEGACY_DIR: path.join(root, 'stopped-backup') });
  opened = await tool('open_skill_manager'); assert.equal(opened.adoptions.total, 4); assert.equal(opened.pluginCalls.total, 2);
  assert.equal(opened.skills.find(s => s.id === skill.id).annotation.note, '升级后验收备注');
  await stop(); assert.deepEqual(await hashes(legacy), original);
  check('stopped backup recovers later records; original legacy files remain unchanged');
  await uninstall();
  const report = { version: JSON.parse(await readFile(path.join(packageRoot, 'plugin.json'))).version, installation: mcpOnly ? 'Codex CLI MCP registration' : 'Codex CLI local marketplace', packageSha256: digest(await readFile(path.join(packageRoot, 'server', 'src', 'server.mjs'))), checks, data: 'synthetic isolated fixture', desktopUI: 'not exercised', root, cached, persistent, profile, codexHome };
  await save(path.join(root, 'result.json'), JSON.stringify(report, null, 2));
  console.log(`RESULT ${path.join(root, 'result.json')}`);
} finally { await stop(); }
