# 本地侧栏原型验证

目前采用 Codex 原生 MCP 注册验证入口，尚未提供插件市场安装包。这一步验证当前桌面版本是否发现 global 入口；通过前不宣称侧栏可用。

## Windows 开发安装

先在仓库根目录运行：

```powershell
npm.cmd ci --ignore-scripts
npm.cmd test
$nodeExecutable = (Get-Command node).Source
$managerEntry = (Resolve-Path ./src/server.mjs).Path
codex mcp add codex-skill-manager -- $nodeExecutable $managerEntry
codex mcp get codex-skill-manager
```

不要删除或移动此工作目录；配置引用其中的服务和构建产物。原型只读扫描技能元数据和插件 manifest，不读取会话或凭据，不需要 API 密钥。更新服务代码后需要重新加载 MCP 服务；可通过退出并重开桌面应用完成。

## 宿主验收

保存当前工作后退出并重新打开 Codex 桌面应用。检查侧栏是否能找到“能力管理器”或对应服务入口。记录：是否出现、是否能固定、点击能否显示页面、页面是否收到示例数据、再次重启是否保留。

如果没有入口，保留版本号与 MCP 连接状态；不要改隐藏开关。MCP 工具能调用或资源能读取，并不能证明侧栏功能已通过。

本地注册命令不会自动重启桌面应用。重启由用户执行，避免中断其他进行中的工作。

## 撤销开发安装

```powershell
codex mcp remove codex-skill-manager
```

然后重启桌面应用。该命令只移除服务配置，不删除项目文件。安装、查询和移除必须在同一用户配置环境中运行。
