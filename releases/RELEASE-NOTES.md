# 发布说明 · @local/sticky-board 0.21.0

- **日期**：2026-11-23
- **形态**：本地 tarball（决策 D2：不向公网 npm 发布）
- **产物**：`local-sticky-board-0.21.0.tgz`（92,955 字节 / 15 个文件）
- **SHA256**：`e9238ba2fddb2c1493daf9ae9cbf5ac1c67678f09bf1984102edc56122728bdb`
- **许可**：MIT

## 本版内容（跨板移动）

| 项 | 说明 |
|---|---|
| Host 半 | 新增 `POST card.moveToBoard`（`ids` 批量 / 单 `id`）+ `repository.moveCardsToBoard`：从源板移除、源列 order 压实、目标列按 ids 顺序追加、目标完成列标完成、离开源完成列清完成+验收（目标无完成列时同样清）、容量 500 / 看板 404 / 列 400；整批一次写入、一步撤销 |
| 快照 | `boards[]` 每项新增 `columns` / `doneColumnId`，`board.list` 同；面板无需额外请求即可列出目标板列 |
| 面板 | 多选卡片「移到 ▾」两级菜单：先列本板列，再列其他看板；点其他看板显示该板列（可返回），选中即整批跨板移动并提示目标板名 |
| 工具 | `sticky_task_move` 支持 `boardId`（可选 `columnId`，省略落到目标板第一列）；`sticky_task_bulk` 支持 `boardId` + `columnId` 整批跨板（不能与其他字段混用）；`sticky_board_manage list` 打印每块板的列 id 与完成列 |

卡片 id 与便签关联在跨板移动时保留；数据模型仍为 schema v5，升级无需迁移。

完整历史见 `CHANGELOG.md`。

## 产物校验（本机实测）

| 项 | 结果 |
|---|---|
| 文件清单 | 15 个，与 `npm run pack:check` 一致 |
| 解包版本 | `package/package.json` = 0.21.0 |
| 解包冒烟 | 解包后跑 `scripts/smoke.mjs`：**39 / 39** |
| 单测 | `node --test` **76 / 76**（含跨板移动渲染菜单、路由/工具跨板语义） |
| Host 冒烟 | `npm run smoke` **39 / 39** |
| 对比度 | `npm run check:contrast` 全绿 |
| lint / 语法 | `npm run lint:client` 0 问题；`node --check` 全部通过 |
| CI | GitHub Actions：`unit` / `smoke` / `checks` 三个 job 绿色 |

## 安装 / 升级

```powershell
plugin_manager action=remove_bundle target=@local/sticky-board
plugin_manager action=install_bundle target=<tgz 或解包目录绝对路径>
# 然后页面 Ctrl+Shift+R
```

数据在 `$DSH_HOME/sticky-board/board.json`；升级不会动数据。跨板移动目前只作用于卡片（便签在墙上，不属于某块看板）。
