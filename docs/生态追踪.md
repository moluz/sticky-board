# 追踪清单与结论

> 目的：把「盯什么、为什么盯、扫完怎么判断」固定下来，避免每次重新讨论。
> 数据快照见 [../data/ecosystem.json](../data/ecosystem.json)。

## 1. 跟踪范围（按优先级）

### A. DSH 本身（最高优先级，常态化）

| 跟踪项 | 为什么 | 触发动作 |
|---|---|---|
| DSH 版本 / `engines.dsh` | 宿主 API、Slot、主题 token 变化是插件最大维护风险 | 每次 DSH 升级后：`npm test` + `npm run smoke` + 主题/槽位手测 |
| 宿主 Service/Event 契约 | 我们依赖 `theme`（getTheme / theme.change）、`slots`、`locale`、`connection.fetch` | `cordis_inspect_query` 对比签名；有破坏性变更立即开 issue/分支 |
| 官方实验 bundle 的新能力 | 可能替代我们自研的一部分（如会话搜索、forge） | 每季度评估一次「能否删代码」 |

### B. 同类 DSH 插件（月度）

只看**便签墙 / 看板 / todo 板**这三类；市场里已有 15+ 个同类（见 `data/ecosystem.json → adjacentPlugins`）。

每条只回答两个问题：**我能借什么？我明确不做什么？**

当前共识（2026-11-22）：

- **借**：工具集划分（墙级/条目级）、撤销与模板语义、列语义/验收字段的表达、密度与筛选的信息架构、单文件存储的备份提示。
- **不借**：侧栏平铺替代主面板、每任务一个 agent session、Gitea/外部数据源依赖、Markdown 当权威数据源、密码保护、浮窗+整页双渲染路径。
- **我们的差异点**（不要被功能对齐带偏）：墙↔板双向联动、14 个模型工具与 UI 同源、跟随宿主明暗、零依赖、单 JSON 原子写。

### C. 非 DSH 产品（季度，借交互不借功能）

| 项目 | 只看 |
|---|---|
| Obsidian Kanban | 列内快速录入、卡片内 checklist 手感 |
| Excalidraw / tldraw | 拖动/缩放跟手感、低端设备降级 |
| Focalboard / Planka / Vikunja | 列语义、排序持久化、筛选信息架构 |
| Memos / Anytype | 轻量录入、本地优先存储与备份 |

## 2. 月度扫描流程（15 分钟）

```text
1. plugin_manager action=list_bundles            → 版本/启用项有无变化
2. plugin_market action=list_plugins query=...    → 新同类插件（kanban / board / sticky / todo / 白板）
3. 对每个新条目：一句话摘要 + borrow / notBorrow
4. 更新 data/ecosystem.json（generatedAt 改为当天）并提交
5. 有「值得做」的结论 → 转成 sticky-board 仓库 docs/待办与决策.md 的 D 编号
```

筛选规则：**同类形态 + 能说清借鉴/不借鉴** 才收录；泛工作流/记忆/会话类插件不收录。

## 3. 收录决策门槛（三个都要满足）

1. 符合本项目约束：**单机 / 本地单 JSON / 零运行时依赖 / 嵌入 DSH**；
2. 能在 **1 天内**完成，且不引入新的维护面；
3. 对当前使用者有**明确使用价值**（不是"别的插件有所以我也要有"）。

## 4. DSH 升级适配检查表

- [ ] `node --test`（含 Client 渲染/交互/主题）
- [ ] `npm run smoke`（Host 路由 + 工具）
- [ ] 面板在 `main` / `sidebar.panellist` 仍注册，order 未被挤掉
- [ ] `data-sb-scheme` 仍随宿主主题切换（浅/深各看一次）
- [ ] 弹窗/菜单的 token 与新主题 token 兼容
- [ ] `engines.dsh` 范围是否需要上调
- [ ] `check:contrast` / `pack:check` 仍通过

## 5. 结论留档格式

```text
YYYY-MM-DD | 项目名 | 版本 | 结论：borrow=… / notBorrow=… | 是否转待办：D##
```
