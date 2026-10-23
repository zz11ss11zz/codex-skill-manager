# M1 development package

Version: read plugin.json. This is a development checkpoint, not a public release.
Requires Node.js 20.18+ on PATH. Runtime JavaScript dependencies are bundled;
do not run npm install inside this package.

Build from source with `npm ci` and `npm run build:plugin`. The output directory
is `dist/plugin-<version>`. An existing output is deliberately not overwritten:
move it aside before rebuilding, especially if it contains test data.

For a Windows protocol smoke check, run `node server/src/server.mjs` from this
directory. It waits for MCP messages on stdin; use Ctrl+C to stop. A quiet
process alone is not proof of a successful handshake.

In a Codex environment with local plugin loading, select this directory using
the supported local-plugin workflow. Confirm the global Skill Manager entry
opens, the panel loads, and errors are understandable. If local loading is not
available, record that limitation; marketplace installation is scheduled for M3.

M1 limitation: writable records still live under server/.local. Use disposable
test records. Package replacement does not yet preserve these records; M2 adds
an independent data directory and migration. Do not replace an existing live
installation with this development package.

The package includes third-party license notices. The author's project license
has not yet been selected; this checkpoint does not grant a new project license.
