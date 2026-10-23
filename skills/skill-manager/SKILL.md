---
name: skill-manager
description: Inspect local Codex skill and plugin inventory, explain recorded activity, query usage periods, and manage user-requested notes or reversible skill archives through Codex Skill Manager. Use for this manager's records and troubleshooting; not for discovering or installing unrelated skills.
---

# Skill Manager

Use the connected Codex Skill Manager tools when available. Tool namespace prefixes vary by host; discover the actual tools instead of inventing a full name. Installing this Skill alone does not install its MCP service. If the service is absent, explain the missing dependency and use the repository's installation guide; do not manufacture records or silently modify configuration.

## Inspect and explain

- `open_skill_manager` opens the panel and scans the inventory. A cached plugin is not proof of installation or enablement. Use `check_plugin_status` when the user requests verification; it invokes the CLI and may consult configured marketplaces.
- `query_usage` reads the existing index. Use offset-bearing ISO timestamps with an inclusive start and exclusive end; convert the user's local dates and timezone. It does not import new logs. Invoke `import_usage` when the user requests refreshing historical signals, and report pending bytes, read issues and coverage.
- Keep Skill adoptions, plugin call attempts, historical mentions and read requests distinct. A read request is not proof of adoption; a failed tool attempt still counts as an attempt. Missing/unreadable records and uncovered dates are unknown, not zero. Same-name file instances and ambiguous attribution must remain separate.

## Record actual activity

When recording is enabled by the user's task or standing instructions, record actual activity near the event. This Skill does not enable background monitoring or authorize retroactive reconstruction.

- `record_skill_use`: one array item per adoption; retain repeated items for repeated adoptions. Use an accurate path or plugin-qualified name when names are ambiguous. A batch ID must be unique, 16–80 letters/digits/underscores/hyphens; retry the same batch with the same ID and unchanged items. At most 32 items per batch. A file read solely for audit is not adoption.
- `record_plugin_calls`: one item per actual tool attempt, including failed attempts. Use the actual plugin namespace, full tool name and a unique 16–160-character ID. Retry recording with the same ID; a new actual call needs a new ID. At most 32 items per batch. Do not record discovery or plans, and do not recursively record the recording calls themselves.
- Send only identifiers, never task text, tool arguments, results or credentials. If a write fails, preserve the ID for an appropriate retry and disclose missing records when they affect the answer; do not let accounting block the user's task.

## Notes and reversible archives

Save user-requested notes with the current instance ID, fingerprint and note revision returned by inventory. A conflict requires rereading current state; never overwrite it blindly. A low count is not authorization to archive.

For a requested archive or restore, use `preview_skill_archive` or `preview_skill_restore` to inspect the exact scope and impact, then execute its token with `execute_skill_plan` when that action is authorized. Existing authorization for that same scope is sufficient. System/plugin-owned skills are read-only; restore must not overwrite existing content. Inspect the returned result before claiming completion.

## Troubleshooting boundaries

The default data directory is `$CODEX_HOME/skill-manager/data-v1` (or `~/.codex/skill-manager/data-v1`); an explicit absolute `CODEX_SKILL_MANAGER_DATA_DIR` may override it. Do not delete data, break locks, change access controls, or reinstall automatically to resolve an error. Stop the relevant service before migration or backup restoration. MCP registration, marketplace installation, and a working native sidebar are separate checks.
