# 发布说明 · @local/sticky-board 0.18.0

- **日期**：2026-11-22
- **形态**：本地 tarball（决策 D2：不向公网 npm 发布）
- **产物**：`local-sticky-board-0.18.0.tgz`（84,334 字节 / 15 个文件）
- **SHA256**：`fc3ab72364a3869bcc217201861b6e0f3e24b9a14b750fc27b2c84552ff7d6dd`
- **许可**：MIT

## 本版内容（P1 批次：D5 / 来自 DSH 生态扫描的结论）

| 项 | 说明 | 生态来源 |
|---|---|---|
| schema v4 | 卡片新增 `acceptance`（多行验收标准，≤2000 字）；看板新增 `doneColumnId`。v1/v2/v3 文档读入即迁移；v3→v4 会推断完成列并把该列已有卡片补成完成 | `dsh-super-kanban`（验收标准/交付物）、`dsh-kanban-flow`（列语义） |
| 可配置完成列 | 统计条「完成列 ▾」选择任一列或「不指定完成列」；列头绿色 ✓；移入标完成、移出清除，替代硬编码 `columnId === 'done'`；工具新增 `sticky_board_manage action=doneColumn` | `dsh-kanban-flow` |
| 验收标准 | 抽屉多行编辑（失焦保存）+ 卡片「验收」胶囊；`sticky_task_create` / `sticky_task_update` 支持 `acceptance`，`sticky_task_list` 打印摘要 | `dsh-super-kanban` |
| 批量 / 墙级工具 | 新增 `sticky_note_bulk`（批量改色/置顶/删除/恢复）与 `sticky_task_bulk`（批量移动/优先级/标签/完成/阻塞/删除/恢复）；新路由 `note.bulkUpdate` / `card.bulkUpdate`，整批一次写入、撤销一步；面板多选改走批量接口 | `dsh-plugin-sticky-wall`（墙级/条目级划分）、`dsh-project-kanban`（工具命名/撤销） |

完整历史见 `CHANGELOG.md`。

## 产物校验（本机实测）

| 项 | 结果 |
|---|---|
| 文件清单 | 15 个，与 `npm run pack:check` 一致 |
| 解包版本 | `package/package.json` = 0.18.0 |
| 解包冒烟 | 解包后跑 `scripts/smoke.mjs`：**36 / 36** |
| 单测 | `node --test` **66 / 66**（含 v3→v4 完成列推断/回填、批量写入、渲染交互） |
| Host 冒烟 | `npm run smoke` **36 / 36**（含 acceptance、完成列、批量路由与工具） |
| 对比度 | `npm run check:contrast` 全绿 |
| lint / 语法 | `npm run lint:client` 0 问题；`node --check` 全部通过 |
| CI | GitHub Actions：`unit` / `smoke` / `checks` 三个 job 绿色 |

## 安装 / 升级

```powershell
plugin_manager action=remove_bundle target=@local/sticky-board
plugin_manager action=install_bundle target=<tgz 或解包目录绝对路径>
# 然后页面 Ctrl+Shift+R
```

数据在 `$DSH_HOME/sticky-board/board.json`；升级不会动数据。每日快照在 `board.json.bak-YYYY-MM-DD`（保留 7 份），恢复时把对应文件改回 `board.json` 即可。

升级到 v4 后，`version` 会变为 4；旧版本插件读 v4 文档时仍按未知字段忽略处理（不会丢数据，但完成列/验收标准不生效），建议同步升级。
