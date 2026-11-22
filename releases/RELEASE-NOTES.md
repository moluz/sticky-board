# 发布说明 · @local/sticky-board 0.19.0

- **日期**：2026-11-22
- **形态**：本地 tarball（决策 D2：不向公网 npm 发布）
- **产物**：`local-sticky-board-0.19.0.tgz`（88,037 字节 / 15 个文件）
- **SHA256**：`8f48ff157b9a4e57939299ec5a63ec0eaf688a8348cb86970826d0a055485878`
- **许可**：MIT

## 本版内容（体验收尾批次）

| 项 | 说明 | 来源 |
|---|---|---|
| 列内快速录入 | 列底「＋ 添加任务」改为内联输入框：`Enter` 添加并保持输入（连续录入）、`Esc` 关闭、空标题不建卡；不再生成标题为「添加任务」的占位卡 | Obsidian Kanban（列内快速录入） |
| 搜索覆盖 schema v4 字段 | 卡片匹配标题、描述、`acceptance`、检查项文本、标签；服务端、客户端二次过滤、`sticky_task_list` 的 `query` 同规则；占位提示同步更新 | 自有数据模型补完 |
| 快照恢复入口 | `⋯` →「从快照恢复」列出最近 7 份每日快照（日期 / 大小 / 便签数 / 任务数），选中即恢复；恢复前把当前数据另存为 `board.json.restore-backup`，恢复进撤销栈（`Ctrl+Z`）、`rev` 继续前进；`POST backup.list` / `backup.restore` 支撑 | `dsh-local-board`（单文件备份提示） |

数据模型不变（仍为 schema v4），升级无需迁移。

完整历史见 `CHANGELOG.md`。

## 产物校验（本机实测）

| 项 | 结果 |
|---|---|
| 文件清单 | 15 个，与 `npm run pack:check` 一致 |
| 解包版本 | `package/package.json` = 0.19.0 |
| 解包冒烟 | 解包后跑 `scripts/smoke.mjs`：**37 / 37** |
| 单测 | `node --test` **71 / 71**（含快照列表/恢复/restore-backup、列内快速录入、搜索二次过滤、快照弹窗） |
| Host 冒烟 | `npm run smoke` **37 / 37** |
| 对比度 | `npm run check:contrast` 全绿 |
| lint / 语法 | `npm run lint:client` 0 问题；`node --check` 全部通过 |
| CI | GitHub Actions：`unit` / `smoke` / `checks` 三个 job 绿色 |

## 安装 / 升级

```powershell
plugin_manager action=remove_bundle target=@local/sticky-board
plugin_manager action=install_bundle target=<tgz 或解包目录绝对路径>
# 然后页面 Ctrl+Shift+R
```

数据在 `$DSH_HOME/sticky-board/board.json`；升级不会动数据。每日快照在 `board.json.bak-YYYY-MM-DD`（保留 7 份），恢复现在可以直接在面板 `⋯` → 从快照恢复 里完成；恢复前的当前版本会留在 `board.json.restore-backup`。
