import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setup } from '../scripts/setup.mjs';
const run = promisify(execFile);

test('isolated Codex registration installs, remains idempotent and uninstalls without changing unrelated settings', { skip: process.env.SKILL_MANAGER_TEST_CODEX !== '1', timeout: 30000 }, async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'skill-manager-setup-'));
  // CODEX_HOME is scoped to child CLI processes, never the user's real configuration.
  const env = { ...process.env, CODEX_HOME: temporary };
  const config = path.join(temporary, 'config.toml');
  try {
    await writeFile(config, 'model = "test-model-preserved"\n');
    const options = { env, build: false };
    assert.equal((await setup('check', options)).registered, false);
    assert.equal((await setup('install', options)).status, 'installed');
    const installed = await readFile(config, 'utf8');
    assert.ok(installed.includes('test-model-preserved'));
    assert.equal((await setup('install', options)).status, 'already-registered');
    assert.equal(await readFile(config, 'utf8'), installed);
    assert.equal((await setup('check', options)).matches, true);
    assert.equal((await setup('uninstall', options)).status, 'uninstalled');
    assert.ok((await readFile(config, 'utf8')).includes('test-model-preserved'));
    assert.equal((await setup('check', options)).registered, false);
    await run(process.env.CODEX_SKILL_MANAGER_CLI || 'codex', ['mcp', 'add', 'codex-skill-manager', '--', process.execPath, '--version'], { env, windowsHide: true });
    const foreign = await readFile(config, 'utf8');
    await assert.rejects(setup('install', options), /同名 MCP 注册/);
    await assert.rejects(setup('uninstall', options), /同名 MCP 注册/);
    assert.equal(await readFile(config, 'utf8'), foreign);
  } finally { await rm(temporary, { recursive: true, force: true }); }
});
