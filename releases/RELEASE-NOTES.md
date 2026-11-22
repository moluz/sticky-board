# 发布说明 · @local/sticky-board 0.17.0

- **日期**：2026-11-22
- **形态**：本地 tarball（决策 D2：不向公网 npm 发布）
- **产物**：`local-sticky-board-0.17.0.tgz`（78,364 字节 / 15 个文件）
- **SHA256**：`ea4bf8d891cca48b81769ffed57e65ab43d992bd4d6cac446878f21bfd720b1e`
- **许可**：MIT

## 本版内容（P0 批次：来自 DSH 生态扫描的结论）

| 项 | 说明 | 生态来源 |
|---|---|---|
| schema v3 | 卡片新增 `blocked` / `blockedReason`（≤200 字），settings 新增 `lastBackupAt`；v1/v2 文档读入即迁移 | `dsh-super-kanban`（blockers）、`dsh-kanban-flow`（列语义） |
| 每日快照备份 | 每天首次写入前复制 `board.json` → `board.json.bak-YYYY-MM-DD`，保留最近 7 份 | `dsh-local-board`（单文件备份） |
| 阻塞卡 | 抽屉开关 + 原因输入；卡片红色「阻塞」胶囊；看板筛选「只看阻塞」 | 同上 |
| 统计条 | 看板上一行：各列计数、P0+P1、逾期、阻塞，后三者点击即套用筛选 | `dsh-session-kanban`（概览） |
| 墙面筛选/密度 | 纸色多选 + 只看置顶；`wallDensity` 落地为紧凑/标准/宽松三档 | `@vfvrpq/dsh-sticky-notes`（密度/颜色筛选） |

完整历史见 `CHANGELOG.md`。

## 产物校验（本机实测）

| 项 | 结果 |
|---|---|
| 文件清单 | 15 个，与 `npm run pack:check` 一致 |
| 解包版本 | `package/package.json` = 0.17.0 |
| 单测 | `node --test` **62 / 62**（含 schema v3 迁移、每日备份轮转） |
| Host 冒烟 | `npm run smoke` **33 / 33**（含阻塞字段往返） |
| 对比度 | `npm run check:contrast` 全绿 |
| CI | GitHub Actions：`unit` / `smoke` / `checks` 三个 job 绿色 |

## 安装 / 升级

```powershell
plugin_manager action=remove_bundle target=@local/sticky-board
plugin_manager action=install_bundle target=<tgz 或解包目录绝对路径>
# 然后页面 Ctrl+Shift+R
```

数据在 `$DSH_HOME/sticky-board/board.json`；升级不会动数据。每日快照在 `board.json.bak-YYYY-MM-DD`（保留 7 份），恢复时把对应文件改回 `board.json` 即可。
