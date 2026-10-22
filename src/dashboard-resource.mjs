import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';

export const dashboardFile = fileURLToPath(new URL('../dist/dashboard.html', import.meta.url));
export const dashboardRevision = html => createHash('sha256').update(html).digest('hex').slice(0, 16);
const resourceUri = revision => `ui://codex-skill-manager/dashboard-${revision}.html`;
const mimeType = 'text/html;profile=mcp-app';

async function atomicWrite(file, text) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, text, { flag: 'wx' });
    await rename(temporary, file);
  } finally { await unlink(temporary).catch(() => {}); }
}

// Retain immutable builds: Codex can route a global entry to another session's server.
export async function publishDashboard(html, file = dashboardFile) {
  const revisions = path.join(path.dirname(file), 'revisions');
  await mkdir(revisions, { recursive: true });
  const archive = async text => {
    const destination = path.join(revisions, `${dashboardRevision(text)}.html`);
    try {
      if (await readFile(destination, 'utf8') !== text) throw new Error('Dashboard revision content mismatch');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await atomicWrite(destination, text);
    }
  };
  try { await archive(await readFile(file, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  await archive(html);
  await atomicWrite(file, html);
  return resourceUri(dashboardRevision(html));
}

export function registerDashboard(server, file = dashboardFile) {
  const html = readFileSync(file, 'utf8');
  const uri = resourceUri(dashboardRevision(html));
  server.registerResource('dashboard', uri, { mimeType }, async () => ({
    contents: [{ uri, mimeType, text: html }],
  }));
  server.registerResource('dashboard-revision', new ResourceTemplate(
    'ui://codex-skill-manager/dashboard-{revision}.html', { list: undefined },
  ), { mimeType }, async (requestedUri, { revision }) => {
    if (typeof revision !== 'string' || !/^[a-f0-9]{16}$/.test(revision)) throw new Error('Invalid dashboard revision');
    const text = await readFile(path.join(path.dirname(file), 'revisions', `${revision}.html`), 'utf8');
    if (dashboardRevision(text) !== revision) throw new Error('Dashboard revision content mismatch');
    return { contents: [{ uri: requestedUri.href, mimeType, text }] };
  });
  return uri;
}
