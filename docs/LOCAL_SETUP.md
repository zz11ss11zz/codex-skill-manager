# v0.1.0 安装、升级与卸载

需要 Windows、Node.js 20.18+ 和 PATH 中可用的 Codex CLI。无需 API 密钥。网络用于获取源码与 npm 依赖；应用不上传日志。其他平台未验证，详见 [已知限制](KNOWN_LIMITATIONS.md)。

## 安装

从 [v0.1.0 Release](https://github.com/zz11ss11zz/codex-skill-manager/releases/tag/v0.1.0) 下载源码 ZIP，解压到长期保留的位置，在含 package.json 的目录打开 PowerShell：

```powershell
node --version
codex --version
npm.cmd ci --ignore-scripts
npm.cmd test
npm.cmd run setup:install
npm.cmd run setup:check
```

最后 registered、matches、enabled 应均为 true。脚本先构建页面，再通过官方 CLI 注册当前 Node 和源码入口的绝对路径。同名注册指向其他目录时拒绝覆盖；停用状态不自动改变。

保存工作后重载 MCP 服务或重开桌面应用。入口工具为 open_skill_manager；npm start 启动 stdio 服务，不会打开网页。不要删除/移动源码目录或 Node。MCP 注册不自动安装配套 Skill，也不等于所有侧栏交互通过。

Git 用户可使用：

```powershell
git clone --branch v0.1.0 --depth 1 https://github.com/zz11ss11zz/codex-skill-manager.git
cd codex-skill-manager
```

再执行上方 npm 命令。Git 连接失败时改用 Release ZIP，不关闭 TLS 校验。ZIP 目录不能 git pull。

## 升级与备份

先停止旧服务并备份持久数据。默认数据在 CODEX_HOME 下 skill-manager/data-v1；未设置 CODEX_HOME 时为用户目录的 .codex/skill-manager/data-v1。CODEX_SKILL_MANAGER_DATA_DIR 可指定其他绝对目录。

- 原目录更新源码后重新安装依赖、测试、setup:install，并重载服务。
- 换目录时先从旧目录运行 npm.cmd run setup:uninstall，再从新目录安装；不强制覆盖其他同名服务。
- 旧 .local 按 [迁移与回退](DATA_MIGRATION.md) 明确来源并核验。原文件和时点备份保留，不用旧快照覆盖后续新增记录。
- 旧目录丢失时，先用 codex mcp get codex-skill-manager 核对，再通过官方 CLI 移除确认过的注册。

## 卸载

```powershell
npm.cmd run setup:uninstall
npm.cmd run setup:check
```

registered 应为 false，再重载宿主。仅移除当前目录对应的注册，源码、持久数据、旧 .local 和技能归档保留。移除 marketplace 与 MCP 注册不同。

## 排错与验证

普通打开仅读取已有统计，import_usage 才显式导入日志；未记录不表示从未使用。当前页面展示活动视图，其他能力通过后台工具操作。

遇到损坏文件/写锁/迁移失败，保留原文件和错误，停止相关服务后按迁移说明恢复；不要自动删除锁、索引或源日志。Windows 技能归档恢复不覆盖同名文件。

可选 CLI 回归：`$env:SKILL_MANAGER_TEST_CODEX='1'; npm.cmd test`。测试使用隔离数据。具体范围见 [VALIDATION.md](VALIDATION.md)；问题提交至 [GitHub Issues](https://github.com/zz11ss11zz/codex-skill-manager/issues)，只附脱敏错误和复现步骤。
