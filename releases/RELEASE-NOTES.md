# 发布说明 · @local/sticky-board 0.20.0

- **日期**：2026-11-22
- **形态**：本地 tarball（决策 D2：不向公网 npm 发布）
- **产物**：`local-sticky-board-0.20.0.tgz`（90,081 字节 / 15 个文件）
- **SHA256**：`487873f07d3792c9a1e0f863d9adac619685d22053cda5f95667eb074c08d70c`
- **许可**：MIT

## 本版内容（D4 验收闭环 + 多选小修）

| 项 | 说明 | 来源 |
|---|---|---|
| schema v5 | 卡片新增 `acceptedAt`（时间戳或 null），与 `done` 构成「完成 / 验收」两个状态；v1–v4 读入即迁移，v4→v5 只补 null、不回填完成；取消完成或移出完成列自动清验收 | `dsh-todo-board`「AI 已完成 / 用户已验收」双状态 |
| 面板验收 | 抽屉显示未完成 / 待验收 / 已验收，完成前不能验收；卡片黄色「待验收」/ 绿色「已验收」；统计条「待验收 N」可点套筛选，筛选弹层加「只看待验收」 | `@kira905` 人工验收闸门 |
| 人工验收闸门 | `sticky_task_update` 没有验收参数，模型只能标完成、不能代替人验收；`sticky_task_list` / `sticky_board_get` 报告 `accepted` / `pending-accept` 与待验收数 | 同上 |
| 多选小修 | 便签多选条 `●●` 改为「●● 改色」；置顶按钮在全选已置顶时切换为「取消置顶」，一次批量写入 | 用户反馈 |

语义默认：验收要求先完成；验收不自动移动卡片/列；取消完成或移出完成列清验收；取消验收不影响完成。

完整历史见 `CHANGELOG.md`。

## 产物校验（本机实测）

| 项 | 结果 |
|---|---|
| 文件清单 | 15 个，与 `npm run pack:check` 一致 |
| 解包版本 | `package/package.json` = 0.20.0 |
| 解包冒烟 | 解包后跑 `scripts/smoke.mjs`：**38 / 38** |
| 单测 | `node --test` **75 / 75**（含 v4→v5 迁移范围、验收规则、渲染验收流程、置顶切换） |
| Host 冒烟 | `npm run smoke` **38 / 38** |
| 对比度 | `npm run check:contrast` 全绿 |
| lint / 语法 | `npm run lint:client` 0 问题；`node --check` 全部通过 |
| CI | GitHub Actions：`unit` / `smoke` / `checks` 三个 job 绿色 |

## 安装 / 升级

```powershell
plugin_manager action=remove_bundle target=@local/sticky-board
plugin_manager action=install_bundle target=<tgz 或解包目录绝对路径>
# 然后页面 Ctrl+Shift+R
```

数据在 `$DSH_HOME/sticky-board/board.json`；升级不会动数据。已有的完成卡不会自动视为已验收，会显示为「待验收」，由你在面板逐张确认。
