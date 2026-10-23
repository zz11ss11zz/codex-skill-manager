# 开发市场目录

这是 M3 开发产物，尚不是公开发布包或已验证的 GitHub 市场。新版完整包已通过 Windows 市场安装、宿主 Skill 发现、启动、重启、替换、卸载与数据保留验收；真实原生侧栏验收仍未完成。源码仓库尚未提供可直接安装的远程目录，不应把 `codex plugin marketplace add zz11ss11zz/codex-skill-manager` 宣传为可用安装入口。

## 构建与使用

需要 Node.js 20.18+ 和 Codex CLI，在源码目录运行：

```sh
npm ci --ignore-scripts
npm run build:marketplace
```

输出为 `dist/marketplace-<package.json 版本>/`，含 `.agents/plugins/marketplace.json`、独立插件、运行依赖和配套 `skills/skill-manager/SKILL.md`。已有输出目录不覆盖；运行 `npm run build` 后，可用 `node scripts/build-marketplace.mjs <新的目录>` 指定另一个输出位置。

以下本地市场安装流程已在 Windows、CLI 0.163.0-alpha.11.1 中实际通过。先使用隔离配置和测试数据；确认 `CODEX_HOME` 指向预期配置：

```sh
codex plugin marketplace add <市场目录绝对路径> --json
codex plugin add codex-skill-manager@codex-skill-manager-dev --json
codex plugin list --json
```

第一步只登记市场。安装成功后应检查返回的缓存路径，重载宿主，验证 `skill-manager` Skill 和 `open_skill_manager` 工具可发现，再验证面板、新增合成记录、重启与数据保留。协议握手不代替真实面板验收。

卸载插件和移除市场是两件事：

```sh
codex plugin remove codex-skill-manager@codex-skill-manager-dev --json
codex plugin marketplace remove codex-skill-manager-dev
```

持久记录保留在 `$CODEX_HOME/skill-manager/data-v1`，或显式配置的外部数据目录；迁移、停机备份和回退见包内 `DATA_MIGRATION.md`。

## 已解决的安装阻塞

旧包包含独立 HTML 和 `.txt` 许可文本，在缓存激活时报拒绝访问。文件子集对照和短时重命名失败支持文件类型相关的短暂争用；测试副本关闭内容索引未改变结果，Restart Manager 未识别占用进程。具体操作系统占用者仍未确认。

修复采用独立包构建调整：将当前页面原文编入服务 JavaScript bundle，第三方许可原文保留为可阅读的 `THIRD_PARTY_NOTICES.md`。MCP 页面 URI、MIME 类型、内容字节及版本校验不变；源码开发仍保留磁盘版本档案。独立包与此前一样仅带当前页面版本，旧版本或未知 URI 拒绝返回错配内容。没有修改宿主二进制、ACL、防护设置或手工填充缓存。

新版通过 11 项真实市场生命周期检查，包括实际 app-server Skill 发现、页面内容逐字节比对、原位重装、卸载/重装数据保留。本包安装阻塞已解决，不代表修复了整个 Windows 文件系统的短暂争用。旧的独立 HTML 包报错时，应从新版源码重新构建；其他宿主若仍失败应如实保留错误，源码 MCP 注册仍是独立的开发备选路径。

复现命令（在源码目录中运行）：

```sh
node scripts/diagnose-install.mjs <已构建插件包的绝对路径>
```

脚本仅在忽略的 `work/` 中创建隔离配置和测试副本，保留 `result.json`；不修改真实配置，不启动故意缺少资源的诊断插件。诊断报告不要公开个人路径和本地记录。

## 记录约定与后续

配套 Skill 说明工具、计数口径和排错边界，不是自动运行的记录钩子。只有任务或长期指令已启用记录且工具可用时，才记录实际采用/调用；重试记录沿用 ID，新事件使用新 ID。缺失记录不代表从未使用。仅安装 Skill 不会安装 MCP 服务。

本地完整包安装已验收通过；M3 仍需远程市场验证，原生侧栏验收另列。完成剩余门禁后再推进 M4 发布候选。构建目录不代表发布、上架、授予许可证或修改真实配置。

格式依据（2026-10-23 核查）：https://developers.openai.com/plugins/build/plugins
