# 便签墙 + 任务板（`@local/sticky-board`）

[![Release](https://img.shields.io/github/v/release/moluz/sticky-board?label=release)](https://github.com/moluz/sticky-board/releases)
[![License](https://img.shields.io/github/license/moluz/sticky-board)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-57%20passed-brightgreen)](#开发与验证)
[![Smoke](https://img.shields.io/badge/host%20smoke-32%20steps-blue)](#开发与验证)
![DSH](https://img.shields.io/badge/DSH-%E2%89%A5%200.2.1--rc.4-4f8cff)
[![Downloads](https://img.shields.io/github/downloads/moluz/sticky-board/total)](https://github.com/moluz/sticky-board/releases)

一个 DeepSeek Harness Web UI 插件：**自由摆放的便签墙**和**拖拽任务板**共用同一份数据，支持墙 ↔ 板双向转换，并把同一套操作暴露给模型工具。

- 面板位置：左侧栏入口（order 16）+ 中央 `main` 主面板
- 数据位置：`$DSH_HOME/sticky-board/board.json`（可用插件配置 `storePath` 改）
- 仓库：<https://github.com/moluz/sticky-board>（MIT，含 Release 产物）
- 设计与调研：[docs/调研与初步方案.md](docs/调研与初步方案.md)
- 验证记录：[docs/验证记录.md](docs/验证记录.md)

## 安装

在插件管理器里安装本目录（本地目录安装，不要手写 profile 的 `package.json` / `cordis.patch.yml`）：

```
plugin_manager action=install_bundle target=<clone 目录绝对路径>
```

从 GitHub 首次安装：

```powershell
git clone https://github.com/moluz/sticky-board.git
# 再对上目录执行 install_bundle；或直接下载 Release 里的 tgz：
# https://github.com/moluz/sticky-board/releases/latest
plugin_manager action=install_bundle target=<tgz 绝对路径>
```

安装结果看返回的 `application`（应为 `applied`）与 `warnings`。装好后左侧栏出现「便签墙 + 任务板」图标，点开即主面板；**页面刷新**后生效。

- 改 **Client 半**（`client.js`）：刷新页面即可（本机 `Ctrl+R` 可能被宿主占用，用 `Ctrl+Shift+R`）。
- 改 **Host 半**（`index.js`、`lib/*.js`）：`install_bundle` 会报 `already-installed`，先 `remove_bundle target=@local/sticky-board` 再装回；实测重装后 Host 立即生效，不用重启 Harness 窗口。
- 卸载：`plugin_manager action=remove_bundle target=@local/sticky-board`（数据文件保留）。

## 功能

**便签墙**

- 新建便签（双击空白处 / 工具条按钮 / `Ctrl+N`）
- 拖动（拖标题栏；移动走 `transform` 合成层，拖拽期间暂停轮询，**无残影/闪烁**）、**右下角拖拽同时调宽和高**（高度未拖过时跟随内容）、折叠/展开
- 双击正文进入编辑；`- [ ] ` / `- [x] ` 开头是待办行，`- ` 是列表，`1. ` 是有序列表；编辑框内 `Ctrl+Enter` 保存、`Esc` 取消
- 7 种纸色、置顶、删除（进回收站）、一键「转为任务」
- **点选**后显示蓝色描边（固定色 `#2f6fed`，不随主题变白），配合 `Delete` 快速删除
- **多选**：`Ctrl/Cmd+点击` 增减、`Shift+点击` 选一段；选中后表头出现蓝底操作条「已选 N / **●● 批量改色** / 置顶 / 转为任务 / 删除」，`Delete` 批量移入回收站（toast 里可撤销）

**任务板**

- 多块看板：表头 tab 条切换、`＋` 新建（**弹出模板菜单：三列 / 五列 / 空白**）、**点当前 tab 上的 ✎ 或双击 tab 内联重命名**、拖动 tab 排序、**每个 tab 右侧内嵌 ✕ 删除该板**（至少保留一块，删前二次确认）；每块板有自己的列与卡片
- 三列起步（待办 / 进行中 / 完成），可加列、改名、删列（列内卡片自动迁到第一列）；**自定义列重启后仍在**
- **拖动列头左侧 `⠿` 手柄可调整列顺序**（拖到哪一列就占据那一列的位置：向右拖 2 格就是移 2 格）；列内卡片拖拽换列/排序（HTML5 拖放，松手即保存）；**拖到看板左右边缘自动横向滚动、拖到长列上下边缘自动纵向滚动**
- 优先级色条（P0–P3）、截止日期（过期标黄）、标签、完成勾选
- **拖动时有插入指示线**：悬停卡片显示其上方蓝线（插到它前面），悬停列空白处显示末尾蓝线
- **筛选条**：优先级 P0–P3 多选、只看未完成、只看逾期、按标签子串过滤；按钮上显示生效条件数，弹出层底部可「清除筛选」。**筛选生效时禁用卡片拖动**（过滤后的列表算插入位会错位）
- **多选**：`Ctrl/Cmd+点击` 增减、`Shift+点击` 在**同一列内**连选（跨列时退回单选，不跨列）；选中后表头出现一组蓝底操作条「已选 N / 完成 / 移到 ▾ / 删除」（「移到」是自绘弹出菜单，列出各列），`Delete` 批量移入回收站（toast 可撤销）
- **单击卡片**直接打开右侧详情抽屉（按住 `Ctrl/Cmd/Shift` 时只做多选，不打开）；抽屉里可改标题、描述、优先级（P0–P3 分段按钮）、截止、标签、**检查项（子任务：勾选 / 行内改名 / 删除 / 添加，标题显示 3/5 进度）**；**描述可切换「预览」**（轻量 Markdown：粗体/斜体/行内代码/链接/列表/小标题），抽屉头部显示「已保存 HH:MM:SS」；关联便签时此行提供 **「同步便签内容」**（D1 单向：覆盖任务标题与描述，保留优先级/标签/截止/完成/列）与「取消关联」；底部一排三个等宽**描边**按钮：**完成（绿）/ 转为便签（蓝）/ 删除（红）**，完成是开关，已完成时绿色描边加粗并带 ✓；卡片元信息里会显示 `☑ 1/2` 进度胶囊
- 卡片上的 🔗 可点：跳到关联便签（便签上的 🔗 反过来跳到任务，自动切视图 + 定位/高亮；跨板会自动切换看板）；**跳转后目标会自动滚动到视野内并闪烁一圈蓝光**

**回收站**：便签与任务分两组列出，**支持多选**：全选 / 恢复选中 / 彻底删除选中，另有一键「清空回收站」（顶部操作条与「⋯」菜单各有一个入口）。

**搜索**：**服务端过滤**（输入防抖 220ms，Host 按 `q` 只回匹配的便签与卡片，计数仍是全局值）；搜索期间禁用全部拖拽（便签、卡片、列、看板 tab），避免在过滤后的列表上算错位置。

**性能**：6 秒轮询会比对 `rev`，文档没变就跳过渲染；拖动期间暂停轮询；拖动便签只写 `transform`，不触发 React 重渲染。

**整理 / 备份**

- 墙面「整理」：把便签按四列网格重新排开（置顶优先）
- 所有危险操作（删看板 / 删列 / 批量或单条彻底删除 / 清空回收站 / 导入替换）走**同一套面板自绘确认弹窗**：
  - 结构统一：标题（动作）+ 对象与数量 + 后果说明 + 「可撤销」提示（`Ctrl+Z`，重启后历史清空）
  - 文案按真实行为写：删列会说明「卡片自动移到第一列」，不再写「不可恢复」
  - 交互统一：点遮罩 / `Esc` / 「取消」都取消，`Enter` 或红色主按钮确认；明暗主题同色系
- 「⋯」菜单：撤销 / 重做（带快捷键提示）、导出整份 JSON（含回收站）、**导入 JSON（合并）**、**导入 JSON（替换，二次确认）**、清空回收站

**快捷键**

| 键 | 作用 |
|---|---|
| `Delete` | 删除**当前选中**的便签/任务（移入回收站，可恢复；toast 内可「撤销」）；没有选中时删掉详情抽屉里那张卡 |
| `Shift+Delete` | 彻底删除选中项（二次确认，不可撤销） |
| `Ctrl/Cmd+点击` | 多选：便签或任务加选/减选 |
| `Shift+点击` | 多选连选：便签按墙面显示顺序、任务**只在同一列内**（跨列退回单选） |
| `方向键 ←→↑↓` | 移动选中：便签按墙面顺序；任务 ↑↓ 在同列内移动、←→ 换到相邻列 |
| `Enter` | 打开选中卡片的详情抽屉 |
| `空格` | 切换选中卡片的完成状态 |
| `Ctrl/Cmd+A` | 全选：便签全选墙面可见项；任务全选当前列的卡片 |
| `Ctrl/Cmd+Z` | 撤销上一步写入（多步，Host 内存历史，重启清空） |
| `Ctrl/Cmd+Shift+Z` / `Ctrl/Cmd+Y` | 重做最近一次撤销 |
| `Ctrl/Cmd+N` | 新建便签 / 新建任务（按当前视图） |
| `Ctrl/Cmd+F` | 聚焦搜索框 |
| `Esc` | 依次关闭：菜单 → 取消选择 → 关闭抽屉 → 退出编辑 → 清空搜索 |

> 撤销历史保存在 Host 内存里（默认 30 步），**重启 DSH 后清空**；撤销本身也是一次写入，`rev` 继续前进，其他窗口能正常轮询到。
> 光标在输入框 / 文本域 / 下拉框内时，`Delete` 只编辑文字，不会误删条目。点选：便签点一下整张纸，任务点一下卡片（高亮描边即选中）。删除/导入/整理等操作会在底部弹 toast，软删除带「撤销」。

## 模型工具（14 个）

| 工具 | 作用 |
|---|---|
| `sticky_board_get` | 全局状态：便签/任务数量、看板列表与当前活动板、各列数量、数据文件路径 |
| `sticky_board_manage` | 看板管理：`list` / `select` / `create`（可选 `template: three|five|blank`）/ `rename` / `delete`（任务工具总是作用于当前活动板） |
| `sticky_note_list` / `sticky_note_create` / `sticky_note_update` / `sticky_note_remove` | 便签的查、建、改、删（默认软删） |
| `sticky_task_list` / `sticky_task_create` / `sticky_task_update` / `sticky_task_move` / `sticky_task_remove` | 任务的查、建、改、移动、删；建/改支持 `checklist`（`{ text, done }` 数组，整组替换），列表输出带 `☑ d/n` 进度 |
| `sticky_note_to_task` / `sticky_task_to_note` | 墙 ↔ 板互转，双向写入关联 id |
| `sticky_note_sync_to_task` | 单向把便签内容推到关联任务（保留任务优先级/标签/截止/列） |

工具与 UI 共用 `lib/repository.js`，因此「模型建的任务」在面板上立刻可见，反之亦然。

## 数据

单 JSON 文档，**`version: 2`**（v1 文档读入即迁移：卡片补 `checklist: []`，下次写入落 v2）：

```jsonc
{
  "version": 2,
  "rev": 12,                       // 每次落盘 +1，供面板轮询判断是否有外部改动
  "notes": [{ "id": "note-…", "lines": [{ "id": "l-…", "kind": "text|todo|ul|ol", "text": "", "done": false }],
              "text": "派生可读副本", "color": "amber", "pinned": false, "collapsed": false,
              "x": 0.12, "y": 0.2, "w": 240, "h": null, "trashed": false, "deletedAt": null,
              "linkedCardId": null, "rev": 3, "createdAt": 0, "updatedAt": 0 }],
  "boards": [{ "id": "board-main", "title": "默认看板",
               "columns": [{ "id": "todo", "title": "待办", "order": 0 }, …],
               "cards": [{ "id": "card-…", "title": "", "note": "", "columnId": "todo", "order": 0,
                           "priority": "P2", "labels": [], "checklist": [{ "id": "item-…", "text": "子项", "done": false }],
                           "dueDate": null, "done": false, "noteId": null,
                           "trashed": false, "deletedAt": null, "rev": 1, "createdAt": 0, "updatedAt": 0 }] }],
  "settings": { "activeView": "wall", "wallDensity": "auto", "activeBoardId": "board-main" },
  "updatedAt": 0
}
```

- 卡片 `checklist`（schema v2）：每项 `{ id, text, done }`；最多 100 项、单项文本 300 字上限；整组替换式更新（UI 与工具一致）。
- 多块看板（上限 12），列完全自定义（上限 8 列）；**自定义列与看板重启后仍在**（旧版会塌回固定三列，M4 已修）。
- 便签 `w` 夹到 180–520px；`h` 为 `null`（跟随内容）或 80–900px 的固定高度（拖右下角后变成固定值）。
- 卡片操作永远作用于 `settings.activeBoardId` 指向的板，切换板不会搬动数据。

写入策略：临时文件 + `rename` 原子替换、内容未变跳过写盘、`mutate` 串行队列；解析失败时把原文件改名为 `board.json.corrupt-<时间戳>` 再重建空文档，面板状态条仍显示数据路径。

## HTTP 接口（Host，同源 + 连接服务鉴权）

单端点 `/api/sticky-board`：

- `GET ?trash=1&q=…`：快照（含计数、列、回收站）；`q` 非空时 Host 只回匹配的便签与卡片，`counts` 仍是全局值
- `POST { action, … }`：`note.create|update|remove|restore|toTask|tidy|trashMany`、`card.create|update|move|remove|restore|toNote|trashMany`、`column.add|update|remove|move`、`board.list|add|update|remove|select|move`（`board.add` 可带 `columns: string[]` 播下列）、`locate`、`link`、`link.sync`、`settings.update`、`export`、`import`、`trash.clear|restoreMany|purgeMany`；每个成功响应都带新快照

## 发布 / 分发

决策 D2：**本地 tarball 发布**，不向公网 npm 发布（`@local/*` 作用域不适合公网）。

- 许可：**MIT**（见 `LICENSE`；`package.json` 已声明 `license` / `author`、`private: false`）
- 出包：`npm run release`（= `npm pack --pack-destination releases`）→ `releases/local-sticky-board-<version>.tgz`，15 个文件、约 74 KB（`index.js`、`client.js`、`lib/*.js`、`cordis.patch.yml`、`locale/*.json`、`icon.svg`、`package.json`、`README.md`、`CHANGELOG.md`、`LICENSE`）
- 校验：`npm run pack:check`（清单）+ `releases/SHA256SUMS`（摘要）+ 产物解包后跑 `scripts/smoke.mjs`（Host 端到端）+ `node --check`
- 装到别的机器：`plugin_manager action=install_bundle target=<tgz 绝对路径>`（或解包后装目录）；数据仍落在目标机的 `$DSH_HOME/sticky-board/board.json`
- 升级：`remove_bundle` → `install_bundle`（新 tgz）→ 页面 `Ctrl+Shift+R`；Host 半热替换，无需重启 Harness
- 若要上插件市场：还需公开仓库地址（`repository` 字段）与合法版本号

## 开发与验证

```powershell
npm test              # node --test：57 例（model/store + Client 渲染/交互/主题/弹窗 + lint 自查）
npm run smoke         # Host 端到端：假 ctx → apply → 驱动路由与工具（32 步）
npm run lint:client   # hooks 依赖顺序自查（防「面板空白」类渲染崩溃）
npm run check:contrast # 明暗两套装饰色的 WCAG 对比度守卫
npm run pack:check    # 校验 npm pack 会带上的文件（15 个）
node --check client.js
```

## 明暗主题

- 容器、文字、边框全部走宿主 token（自动明暗）；**装饰色**（选中/强调/成功/危险/优先级/多选提示）收敛为 `--sb-*` CSS 变量，默认深色值，`[data-sb-scheme="light"]` 给浅色覆盖。
- 面板订阅宿主 `theme` 服务：`theme.getTheme().active.colorScheme` 决定根元素的 `data-sb-scheme`，`theme/change` 事件实时跟随；宿主没提供该服务时回退到系统 `prefers-color-scheme`。
- `npm run check:contrast` 从 `client.js` 解析两套调色板，按 WCAG（正文 4.5、描边 3）逐项校验对背景的对比度。
- **Client 渲染 + 交互测试**：`test/client-render.test.mjs` 用 jsdom + 真 React 渲染注册到 `main` 的组件（加载态、完整看板、模板菜单、点卡片开抽屉），并带一个有状态的假 Host：真点复选框、真输入并回车添加检查项，断言发出的 `card.update` 载荷正确。能拦住白屏类崩溃，也能拦住「点了没反应」类回归。
- `jsdom` / `react` / `react-dom` 只在 `devDependencies` 里，打包产物不含它们（`pack:check` 可验证）。

装好后按 `docs/验证记录.md` 的清单做页面验证（明暗主题、刷新与重启后数据仍在、工具写入在 UI 可见）。

## 目录

```
index.js              # Host 装配：store + repository + route + tools
client.js             # Client 半：左栏入口 + main 面板（墙 / 板 / 回收站 / 详情抽屉）
lib/model.js          # 纯函数：归一、行解析、排序、墙↔板转换
lib/store.js          # JSON 持久化：懒加载、串行 mutate、原子写、损坏备份
lib/repository.js     # 便签/任务/列/联动操作（UI 与工具共用）
lib/route.js          # /api/sticky-board 路由与动作分发
lib/tools.js          # 14 个模型工具定义
locale/{zh,en}.json   # 插件标题与描述
LICENSE / CHANGELOG.md
docs/                 # 调研与初步方案、验证记录、待办与已定决策
test/                 # node --test（model / store / client-render / lint-client）
scripts/smoke.mjs     # Host 端到端冒烟
scripts/lint-client.mjs  # hooks 依赖顺序自查
scripts/check-contrast.mjs # 明暗装饰色对比度守卫
scripts/pack-check.mjs   # 打包文件清单校验
```
