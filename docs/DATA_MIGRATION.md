# M2 持久数据与迁移验收

适用开发版本：0.1.0-alpha.0 的 M2 构建。开发节点以包目录名和代码提交区分，尚非公开发布候选。

## 目录与边界

默认数据目录为 `$CODEX_HOME/skill-manager/data-v1`；未设置 CODEX_HOME 时为用户主目录下 `.codex/skill-manager/data-v1`。可用绝对路径环境变量 `CODEX_SKILL_MANAGER_DATA_DIR` 指定另一目录。宿主启动服务时必须传入同样的变量；仅在终端设置不会改变已运行的 Codex 服务环境。

四个文件为 `adoptions.json`、`plugin-calls.json`、`skill-notes.json`、`usage-index.json`。升级、重启和卸载不删除此目录。归档技能原本已在独立的 Codex home 下 `skill-manager-archive`，不参与本次迁移。数据仍是有容量上限的 JSON，不新增数据库依赖或联网行为。

首次启动只查当前源码根目录 `.local`（独立包为 `server/.local`）。从另一个安装位置升级时，**先停止全部旧服务**，把 `CODEX_SKILL_MANAGER_LEGACY_DIR` 设为旧 `.local` 的绝对路径。不会扫描所有缓存或猜选多个来源。未指定且当前包没有旧数据时创建空目录；如需迁移其他来源，必须在首次初始化前指定，避免误开空库。

迁移获取目标初始化锁及四个旧文件写锁，校验格式、容量与文件类型，暂存完成后通过目录重命名一次性发布。已有目标只检查迁移凭据，不重新导入旧文件；不同的明确来源被拒绝，不能自动合并。损坏、占用、链接目录或无法识别的既有目标均停止初始化并保留数据。旧程序必须停用，否则它之后仍可能向旧目录写入，产生分叉。

`migration.json` 保存来源、时间、文件大小和 SHA-256；`migration-backup` 保存迁移时四个文件的原字节，旧目录不删除。这是迁移时快照，**不包含迁移后的新增记录**。它们可能包含私人路径、备注和统计，不应提交仓库或附在公开问题中。

## 隔离测试步骤（PowerShell）

使用测试数据副本和不存在的目标目录，不直接试改真实统计。下面路径是占位示例，替换为自己的测试目录。在 M2 包根目录执行：

```powershell
$env:CODEX_SKILL_MANAGER_DATA_DIR = 'D:\manager-test\persistent'
$env:CODEX_SKILL_MANAGER_LEGACY_DIR = 'D:\manager-test\old\.local'
node server/src/server.mjs --initialize-data
```

预期输出 `migrated: true`（旧目录有记录时），四个文件与旧文件一致，备份哈希一致。普通启动 `node server/src/server.mjs` 进入 MCP stdio 服务；需由支持的宿主加载才能验收面板。源码运行使用 `node src/server.mjs`。

1. 在宿主中加载 M2 包并传入相同环境变量，确认统计和备注与测试基线一致。
2. 新增一条备注或采用记录，停止服务，再从另一位置的 M2 包启动并指向同一持久目录；记录应保留，不应重新用旧 `.local` 覆盖。
3. 停止全部服务，复制整个持久目录到独立备份位置，保留新增记录。卸载/更换包不应影响该目录。
4. 验证迁移快照回退时，使用下述新目标；不要覆盖当前持久目录。回退后应恢复迁移当时的数据，原持久目录仍保有新增记录。

```powershell
$env:CODEX_SKILL_MANAGER_LEGACY_DIR = 'D:\manager-test\persistent\migration-backup'
$env:CODEX_SKILL_MANAGER_DATA_DIR = 'D:\manager-test\rollback'
node server/src/server.mjs --initialize-data
```

要恢复包含新增记录的停机备份，可将 LEGACY_DIR 指向该备份，DATA_DIR 指向另一个全新目录。切回原持久目录前清除 LEGACY_DIR，再调整 DATA_DIR。M2 以前的程序不会读取新环境变量：回退到旧程序只能读取其原 `.local`；如需包含新记录，应在全部服务停止后先备份旧目录，再人工恢复四个同格式文件。不要让新旧程序同时写两套库。

## 故障恢复与验收状态

异常终止可能留下 `<目标>.migration.lock`、旧目录中的 `.lock` 或 `<目标>.staging-UUID`。确认全部相关进程已停止，备份并检查这些文件后再移除锁、重试；程序不根据超时自动抢占未知锁。未发布的暂存目录不会被当成有效数据。格式损坏需从已核实备份恢复到新目录，不能以空文件替代。

自动检查覆盖四类文件保留、重复采用语义、重启/升级后不覆盖新增备注、备份回退、损坏重试、并发启动和旧写锁冲突。真实宿主安装、重启、升级和回退仍待用户检查。反馈时注明步骤、是否保留记录及错误现象即可，无需上传个人记录。
