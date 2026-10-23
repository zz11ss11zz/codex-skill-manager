<h1 align="center">Codex Skill Manager</h1>

<h3 align="center">Local Skill Inventory · Usage Evidence · Activity Insights</h3>

<p align="center">Explore your local Codex skills and plugins with activity heatmaps, usage rankings, and evidence-aware records.</p>

<p align="center">
  <img alt="Node.js 20+" src="https://img.shields.io/badge/Node.js-20%2B-43853d">
  <img alt="Public repository" src="https://img.shields.io/badge/Repository-Public-42645c">
  <img alt="Development preview" src="https://img.shields.io/badge/Status-Development_preview-d49a33">
  <img alt="English and Chinese" src="https://img.shields.io/badge/UI-English_%7C_中文-2878b5">
  <img alt="Local data" src="https://img.shields.io/badge/Data-Local-294c5b">
</p>

<p align="center"><strong>English</strong> | <a href="README.zh-CN.md">中文</a></p>
<p align="center"><a href="#overview">Overview</a> · <a href="#quick-start">Quick Start</a> · <a href="#language">Language</a> · <a href="#evidence-and-counting">Evidence</a> · <a href="#privacy">Privacy</a> · <a href="#development">Development</a></p>

## Overview

Codex Skill Manager is an independent, local MCP sidebar prototype. It is **not an official OpenAI product** and has no stable release yet.

The current dashboard shows a calendar heatmap, an item heatmap, and two rankings. Switch between plugin tool calls and Skill adoptions, choose a year, and narrow item rankings by date. Hover, click, or use the keyboard to inspect counts. Hatched cells indicate missing coverage rather than zero usage.

Inventory, search, evidence details, and archive controls are currently absent from the dashboard. Their backend tools remain available. The project supports local inventory, incremental historical signal import, notes, duplicate candidates, and reversible Windows user-skill archiving.

## Quick Start

Requires Node.js 20 or later and a Codex CLI available on PATH.

```sh
git clone https://github.com/zz11ss11zz/codex-skill-manager.git
cd codex-skill-manager
npm ci --ignore-scripts
npm test
npm run setup:install
npm run setup:check
```

Reload the MCP service and reopen the sidebar after updating. The entry tool is `open_skill_manager`. Running `npm start` starts a stdio MCP process; it does not open a browser.

The setup script uses the Codex CLI to register the service. Uninstallation removes the matching registration and preserves local data:

```sh
npm run setup:uninstall
```

See the [detailed setup and recovery guide (Chinese)](docs/LOCAL_SETUP.md).

## Language

The dashboard uses the MCP Apps host context `locale`: Chinese locales display Chinese; English locales display English. Host locale updates refresh labels without resetting the selected year, dates, or activity type. Tooltips, empty states, error messages, and accessibility labels are localized too. Skill names, paths, and source data retain their original text.

When the host supplies no locale, the browser language is used initially. Unsupported languages fall back to English. Actual propagation of a changed Codex language setting depends on the host; if it sends no update, reopen the panel. Live Codex language-switch acceptance remains to be verified.

## Evidence and Counting

| Signal | What it means |
| --- | --- |
| Skill adoption | The assistant explicitly records an adoption with `record_skill_use`. Repeated adoptions count separately. |
| Plugin tool call | A caller records an attempted tool call with `record_plugin_calls`. Failed attempts count too. |
| Historical read request | A separate inferred signal; reading a Skill file can also mean review or audit. |
| Explicit mention | A separate historical intent signal, not proof of execution. |

Adoptions and plugin calls are separate metrics and are never added together. Recording is opt-in caller behavior, not automatic host monitoring. No records means unknown history, not never used. Enabling a recording tool does not backfill previous activity.

Retries reuse the same batch or call ID for deduplication. New adoptions remain separate even within one conversation. Skill counts use file instances; same-name copies retain their source identity. Ambiguous attribution is not distributed across instances.

Daily totals use the full index rather than the limited evidence list. Rankings use the intersection of the selected dates and recorded coverage. A refresh reads existing statistics; it does not import new chat logs or poll on a timer.

Recording details: [Skill adoptions (Chinese)](docs/ADOPTION_RECORDING.md) · [Plugin calls (Chinese)](docs/PLUGIN_CALLS.md).

## Privacy

Runtime records stay on the local machine under `$CODEX_HOME/skill-manager/data-v1` (default `~/.codex/skill-manager/data-v1`); see [migration and rollback](docs/DATA_MIGRATION.md). The application adds no telemetry, uploads, or external model service. Statistical indexes retain required references and timestamps, not full chat transcripts. Explicit plugin-installation verification can invoke `codex plugin list --json`, which may contact configured marketplaces.

The repository contains code, documentation, and synthetic test data. README badges load from Shields.io when viewing this page; they are not part of the dashboard.

## Development

`npm test` builds the UI and runs unit and stdio MCP integration tests with synthetic temporary directories. UI resources use content-hashed URLs; retained revisions let open panels request their matching version. Do not remove revisions while older panels remain open.

The frontend uses the MCP Apps SDK; backend tools use MCP SDK v1. Dependency versions are pinned. No Python runtime is required.

The current project does not publish an npm package or marketplace installer. Protocol and synthetic UI tests do not establish full live-host acceptance.

Further project records (Chinese): [Roadmap](docs/ROADMAP.md) · [Validation](docs/VALIDATION.md) · [Complete Chinese documentation](README.zh-CN.md).
