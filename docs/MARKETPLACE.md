# Development marketplace

This is an M3 development artifact, not a public release or a verified GitHub marketplace. The current complete package passed Windows marketplace installation, host Skill discovery, service startup, restart, replacement, uninstall and data retention. Native sidebar acceptance is still incomplete. The source repository does not yet expose an installable remote catalog. Do not advertise `codex plugin marketplace add zz11ss11zz/codex-skill-manager` as a working installation route.

## Distribution acceptance boundary (current)

Local acceptance applies only to the recorded build. Remote M3 distribution is not accepted. Complete the mechanism/route decision, artifact provenance and clean remote lifecycle gates in [M3-B through M3-D](V0.1.0_PLAN.md) first. Prebuilt large-file uploads are paused. Generated runtime bundles and node_modules do not belong in source Git by default; splitting uploads does not resolve distribution design.

The official documentation lists npm marketplace sources but explicitly disables lifecycle scripts, so automatic install-time builds cannot be assumed. Downloading a Release package and registering a local marketplace is a candidate multi-step route; direct marketplace consumption of a Release ZIP remains unverified. Validate the selected route without a source checkout or old cache, recording versions, source commit, hashes, notices and actual user steps. The local build commands below do not establish remote acceptance.

## Build

Requires Node.js 20.18+ and the Codex CLI. From the source checkout:

```sh
npm ci --ignore-scripts
npm run build:marketplace
```

Output: `dist/marketplace-<package.json version>/`, containing `.agents/plugins/marketplace.json` and a complete `plugins/codex-skill-manager/` package. JavaScript dependencies and the companion `skills/skill-manager/SKILL.md` are included. Existing output directories are not overwritten. To build to a fresh alternative directory after `npm run build`, run `node scripts/build-marketplace.mjs <new-directory>`.

## Install and verify

This local-marketplace flow passed on Windows with CLI 0.163.0-alpha.11.1. Use disposable test data first. Run with the desired `CODEX_HOME`; do not mistake an isolated test profile for your normal profile.

```sh
codex plugin marketplace add <absolute-marketplace-directory> --json
codex plugin add codex-skill-manager@codex-skill-manager-dev --json
codex plugin list --json
```

The first command registers the catalog; it does not prove plugin installation. Verify the installed cache path from the second command, then reload the host and check discovery of both `skill-manager` and `open_skill_manager`. Exercise the panel, a new synthetic record, restart and data retention. Tool discovery and a protocol handshake alone do not establish native sidebar acceptance.

To remove this development install and its catalog:

```sh
codex plugin remove codex-skill-manager@codex-skill-manager-dev --json
codex plugin marketplace remove codex-skill-manager-dev
```

Persistent records remain outside the plugin under `$CODEX_HOME/skill-manager/data-v1`, unless explicitly overridden. See the package's `DATA_MIGRATION.md`. Removing a catalog is separate from removing its plugin.

## Resolved Windows cache activation error

The earlier package with loose HTML and `.txt` notices failed with `failed to activate plugin cache entry / os error 5`. File-subset probes also reproduced failure for HTML and synthetic large text; copy/rename probes succeeded after a short wait. Search-index attribute changes did not fix it, and Restart Manager did not identify a locking process. The precise OS-level owner remains unknown.

The standalone builder now compiles the exact current dashboard into the server JavaScript bundle and preserves all third-party notice text as `THIRD_PARTY_NOTICES.md`. MCP resource URIs, MIME type, bytes and revision checking stay unchanged; source development still uses its revision archive. The current standalone package includes only its current revision, as before. Old or unknown URIs fail instead of returning different content. No host binary, ACL, security settings or managed cache was manually changed.

The rebuilt package passed 11 real marketplace lifecycle checks, including actual app-server Skill discovery, byte-identical UI response, in-place replacement and uninstall/reinstall data retention. This resolves this package's observed installation blocker; it is not a general fix for Windows filesystem contention. If an older loose-HTML package fails, rebuild from the updated source. Preserve actual errors if a different host still fails; source MCP registration remains an independent development alternative.

Reproduce locally from a source checkout using a built plugin:

```sh
node scripts/diagnose-install.mjs <absolute-plugin-directory>
```

The diagnostic creates an isolated profile under ignored `work/`, writes synthetic plugin copies and retains `result.json`; it never alters the user's actual config. It does not launch the intentionally incomplete probe plugins. Do not publish profile paths or local records with diagnostic reports.

## Recording and distribution

The companion Skill explains available tools and counting semantics. It is not an always-on hook: adoption and call recording require the user's task or standing recording instruction and actual tool availability. Copying the Skill alone does not install the service. Record retries retain IDs; new actual events receive new IDs; missing records are unknown history.

The v0.1.0 release uses source installation under Apache-2.0. This local marketplace remains a developer workflow; remote catalog distribution is outside the release scope. Native-sidebar acceptance remains limited as documented in KNOWN_LIMITATIONS.md. Building this directory does not publish a marketplace or change user configuration.

Format reference, checked 2026-10-23: https://developers.openai.com/plugins/build/plugins
