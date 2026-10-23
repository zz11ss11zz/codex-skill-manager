[English](README.md) | **中文**

# Codex Skill Manager · 能力管理器

**给已记录的 Skill 采用和插件调用，一张看得懂的活动面板。**

查看日期热力图、按时间筛选排名，分别理解 Skill 采用与插件调用尝试。记录保存在本机。

[下载安装](docs/LOCAL_SETUP.md) · [v0.1.0](https://github.com/zz11ss11zz/codex-skill-manager/releases/tag/v0.1.0) · [Apache-2.0](LICENSE) · [反馈问题](https://github.com/zz11ss11zz/codex-skill-manager/issues)

![30 秒演示：切换类型、筛选日期和查看排名；使用合成记录](docs/media/demo.gif)

演示使用真实界面与合成记录，运行在浏览器演示宿主中，不是 Codex 原生侧栏录屏，也不是真实用户统计。中文标题包含 v0.1.0 发布后的一处口径文字修正。[静态图](docs/media/dashboard-skills.png) · [素材说明与复现](docs/media/README.md)。

## 能帮你做什么

- 查看一年中已记录的活动，检查单日数量。
- 在插件调用与 Skill 采用之间切换，避免混算。
- 按日期筛选排名，区分没有覆盖和已记录为零。
- 通过 MCP 工具查询本机清单、备注、重复候选，以及预览和执行 Windows 用户技能的可逆归档。当前活动页面没有这些管理控件。

完整产品由 **本地 MCP 服务＋活动界面＋配套 Skill** 组成。单独安装 Skill 不会安装服务；采用记录需要助手按约定主动写入，插件调用也需要调用方记录。它不会自动监听所有操作，不会补造历史。

## 安装完整管理器

已验证环境为 Windows，需要 Node.js 20.18+ 和 PATH 中可用的 Codex CLI。本项目为独立开源项目，不是 OpenAI 官方产品，尚未上架官方插件目录。

下载 [v0.1.0 源码 ZIP](https://github.com/zz11ss11zz/codex-skill-manager/archive/refs/tags/v0.1.0.zip)，解压到长期保留的位置。在含 package.json 的目录打开 PowerShell：

```powershell
npm.cmd ci --ignore-scripts
npm.cmd test
npm.cmd run setup:install
npm.cmd run setup:check
```

最后 registered、matches、enabled 应均为 true。重载 MCP 服务或重开 Codex，再让助手调用 `open_skill_manager`。不要移动或删除源码目录；`npm start` 启动 stdio 服务，不会打开网页。

源码安装已通过 55 项回归和 6 项隔离服务生命周期检查；最新版桌面原生侧栏交互仍未完成验收。详见 [安装与恢复](docs/LOCAL_SETUP.md)、[验收记录](docs/VALIDATION.md) 和 [已知限制](docs/KNOWN_LIMITATIONS.md)。

## 安装配套 Skill（可选）

先完成服务安装。配套 Skill 提供查询和解释这些记录的操作约定，不会自动开启后台采集。

固定版本的 skills CLI 需要 **Node.js 22.20+**，高于管理器自身要求。进入希望使用该 Skill 的项目目录，替换下方路径为实际解压的源码目录：

```powershell
npx skills@1.7.4 add "C:\tools\codex-skill-manager" --skill skill-manager --agent codex --copy
```

本地源码安装路径已在隔离项目中实际通过。远程 GitHub 命令本次在克隆阶段连接重置，没有记为通过。[完整步骤与远程可选方式](docs/LOCAL_SETUP.md#配套-skill可选)。

安装后可对助手说：“打开能力管理器，解释采用次数和插件调用次数有什么区别。”要记录后续活动，按 [采用记录说明](docs/ADOPTION_RECORDING.md) 或 [插件调用接入](docs/PLUGIN_CALLS.md) 配置明确约定。

## 怎样理解数字

| 记录 | 表示什么 |
| --- | --- |
| Skill 采用 | 助手显式调用 record_skill_use 写入；重复采用分别计数 |
| 插件调用 | 调用方记录的尝试次数，失败尝试也计入 |
| 历史读取或提及 | 独立参考信号，不能直接当作实际采用 |
| 未记录／无覆盖 | 历史未知，不等于从未使用 |

Skill 按文件实例统计，同名副本保留身份。相同批次或调用 ID 重试去重；不同采用不按对话合并。日常刷新只读取现有统计，显式执行 import_usage 才导入历史日志。

## 本地数据与卸载

数据默认位于 CODEX_HOME 下的 skill-manager/data-v1；未设置时使用用户目录的 .codex/skill-manager/data-v1。应用不增加遥测、上传或额外模型服务，不保存完整聊天正文。安装需要联网获取源码和依赖；显式核对插件状态可能访问配置的市场。第三方 skills CLI 的遥测政策独立于本应用，详见其官方说明。

```powershell
npm.cmd run setup:uninstall
```

卸载脚本只移除匹配的 MCP 注册，保留源码和本地数据；配套 Skill 单独管理。[升级、备份与恢复](docs/DATA_MIGRATION.md)。

## 演示、反馈和开发

[中文发布文案与字幕](docs/LAUNCH.zh-CN.md) · [复现演示](docs/media/README.md) · [开发路线](docs/ROADMAP.md) · [完整验收记录](docs/VALIDATION.md)

欢迎在 Issues 提供脱敏错误、复现步骤与统计口径建议。不要上传真实聊天、凭据或未脱敏的本机路径。

`npm test` 构建 UI 并运行合成数据测试；`npm run build:marketplace` 生成本地开发市场包，不代表远程市场或官方目录已经上架。[市场开发说明](docs/MARKETPLACE.zh-CN.md)。

Copyright 2026 Zishen Wang。采用 [Apache-2.0](LICENSE)，见 [NOTICE](NOTICE)；依赖保留各自许可证。
