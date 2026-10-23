// Read the installed CLI's actual skill discovery via app-server, without a model turn.
import { spawn } from 'node:child_process';

export async function listHostSkills({ cwd, env, cli = 'codex' }) {
  const child = spawn(cli, ['app-server', '--stdio'], { cwd, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let buffer = '', sequence = 0;
  const pending = new Map();
  const rejectPending = error => {
    for (const waiter of pending.values()) { clearTimeout(waiter.timer); waiter.reject(error); }
    pending.clear();
  };
  child.on('error', rejectPending);
  const exited = new Promise(resolve => child.once('close', resolve));
  child.once('exit', () => rejectPending(new Error('app-server exited before replying')));
  child.stderr.resume();
  child.stdout.on('data', chunk => {
    buffer += chunk;
    let end;
    while ((end = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
      let message;
      try { message = JSON.parse(line); } catch { continue; }
      const waiter = pending.get(message.id);
      if (!waiter) continue;
      pending.delete(message.id); clearTimeout(waiter.timer);
      if (message.error) waiter.reject(new Error(JSON.stringify(message.error)));
      else waiter.resolve(message.result);
    }
  });
  const request = (method, params) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`app-server timed out: ${method}`)); }, 30000);
    pending.set(id, { resolve, reject, timer });
    child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
  });
  try {
    await request('initialize', { clientInfo: { name: 'skill-manager-acceptance', version: '1' }, capabilities: { experimentalApi: true } });
    child.stdin.write(JSON.stringify({ method: 'initialized' }) + '\n');
    return await request('skills/list', { cwds: [cwd], forceReload: true });
  } finally {
    rejectPending(new Error('app-server acceptance finished'));
    child.stdin.end();
    const timer = setTimeout(() => child.kill(), 2000);
    await exited; clearTimeout(timer);
  }
}
