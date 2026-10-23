# v0.1.0 known limitations / 已知限制

- **Distribution / 分发**: source ZIP → npm dependencies → build/test → MCP registration. Requires Node.js 20.18+ and Codex CLI. No npm release, one-click remote marketplace or official directory listing. MCP registration does not install the companion Skill automatically.
- **Host UI / 宿主界面**: protocol/resource and browser checks exist; the latest complete native sidebar interaction and desktop language switching are not automated. Service startup does not prove every desktop version displays the entry. Do not modify hidden host settings to force it.
- **Platforms / 平台**: Windows with Node.js 20.18.1 and Codex CLI 0.163.0-alpha.11.1 is tested. macOS/Linux are unverified; archive execution is Windows-only.
- **Interface / 页面**: the dashboard currently displays activity views. Inventory/search/notes/archive backend tools exist, but their former UI controls are absent.
- **Evidence / 统计**: recording requires explicit caller participation; no automatic host-wide monitoring or complete historical backfill. Mentions/read requests are inferred signals. Missing coverage is unknown, not zero.
- **Installation / 安装**: keep the source directory and Node executable in place. If Git clone fails, use the versioned GitHub source ZIP. ZIP directories cannot use git pull; follow the change-directory procedure when upgrading.
- **Data / 数据**: stop the service before migration or backup restoration. Migration backups are point-in-time, not continuous backups. Preserve files on corruption/conflicts and do not delete locks while a service may run.
- **Upgrades / 升级**: actual data written by the published v0.0.1-alpha.1 service was migrated to 0.1.0 with byte-identical backups and retained notes/counts. This does not cover every historical version or desktop UI behavior.
- **Windows startup / 启动**: one isolated snapshot-rollback service start closed unexpectedly; direct initialization and a fresh full lifecycle run passed. Its cause was not identified. Preserve diagnostics and original data on failure; do not delete data or disable security controls to retry.

Report issues via [GitHub Issues](https://github.com/zz11ss11zz/codex-skill-manager/issues), including version, OS, Node/Codex versions and redacted errors. Do not upload private logs, credentials or indexes.
