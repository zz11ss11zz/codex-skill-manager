# Changelog

## 0.1.0 — 2026-10-23

First non-prerelease source distribution. Requires Node.js 20.18+ and Codex CLI; Windows is the tested platform.

- Bilingual activity dashboard with calendar/item heatmaps, date filtering and rankings.
- Separate Skill adoption, plugin call and inferred historical signals; retry deduplication and explicit missing-data states.
- Persistent data outside source/plugin caches, guarded legacy migration, backups and recovery.
- Local inventory, notes, duplicate candidates and reversible Windows user-skill archives through backend tools.
- Local development plugin/marketplace builders and companion Skill; no published npm package or remote marketplace installer.
- Fixed rankings ignoring date filters and the observed Windows packaged cache activation failure.
- One version source for package, service, UI and generated manifest; Apache-2.0 license and notices.

Install from the versioned source ZIP and build locally. See [installation](docs/LOCAL_SETUP.md), [known limitations](docs/KNOWN_LIMITATIONS.md) and [validation](docs/VALIDATION.md).

## 0.0.1-alpha.1

Earlier public preview. Historical evidence remains in docs/VALIDATION.md.
