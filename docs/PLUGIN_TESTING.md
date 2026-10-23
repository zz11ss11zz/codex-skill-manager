# M1/M2 development package

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

M2 stores records outside the package under CODEX_HOME/skill-manager/data-v1
(default: ~/.codex/skill-manager/data-v1). CODEX_SKILL_MANAGER_DATA_DIR may
override this with an absolute path. Stop old services before migration;
CODEX_SKILL_MANAGER_LEGACY_DIR selects the old .local directory explicitly.
Set these variables in the service launch environment. Start with disposable
test data. See DATA_MIGRATION.md for backup, rollback and verification steps.

The package includes third-party license notices. The author's project license
has not yet been selected; this checkpoint does not grant a new project license.
