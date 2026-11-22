# 发布说明 · @local/sticky-board 0.16.0

- **日期**：2026-11-22
- **形态**：本地 tarball（决策 D2：不向公网 npm 发布）
- **产物**：`local-sticky-board-0.16.0.tgz`（74,100 字节 / 15 个文件 / 解包约 301 KB）
- **SHA256**：`d99b19097c1bda08d9ed523d59ed334f7150567634a7eb2e073b0003f281eb36`
- **许可**：MIT

## 本次版本包含

| 版本 | 内容 |
|---|---|
| 0.16.0 | 危险操作统一确认弹窗文案：标题 + 对象/数量 + 后果 + 可撤销提示（`Ctrl+Z`） |
| 0.15.0 | 自绘明暗主题确认弹窗，替代 `window.confirm`（删板 / 删列 / 彻底删除 / 清空回收站 / 导入替换） |
| 0.14.2 | 看板删除入口移到每个 tab 内部 |
| 0.14.0 | 明暗主题巡检：装饰色收敛为 `--sb-*` 变量 + 浅色覆盖，订阅宿主 `theme/change` |
| 0.13.0 | 多步撤销/重做（Host 内存历史 30 步，`Ctrl+Z` / `Ctrl+Shift+Z`） |
| 0.12.0 | 卡片 checklist 子任务（schema v2，含 v1→v2 迁移） |

完整历史见 `CHANGELOG.md`。

## 产物校验（本机实测）

| 项 | 结果 |
|---|---|
| 文件清单 | 15 个，与 `npm run pack:check` 一致 |
| 解包后 Host 冒烟 | `scripts/smoke.mjs` **32 / 32 通过**（在解包目录里跑） |
| 语法 | `node --check client.js` 通过 |
| Host 入口 | `import index.js` → `apply, inject, name` |
| 版本一致性 | 包内 `package.json` = 0.16.0 |
| 可重复构建 | 重建 tarball 得到相同 SHA256（npm pack 规范化时间戳） |

## 安装 / 升级

```powershell
# 安装产物
plugin_manager action=install_bundle target=<解包目录或 tgz 的绝对路径>

# 升级既有安装
plugin_manager action=remove_bundle target=@local/sticky-board
plugin_manager action=install_bundle target=<新 tgz 绝对路径>
# 然后页面 Ctrl+Shift+R
```

数据在目标机 `$DSH_HOME/sticky-board/board.json`，卸载/升级不会动它。
