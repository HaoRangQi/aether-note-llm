# 启动与接入指南

> **目标读者**：第一次接手 Aether Note LLM 这个项目的工程师、贡献者、或者只想把它装到自己 Obsidian 里用起来的用户。
>
> 读完这份文档，你能：
>
> 1. 在 60 秒内验证项目能跑（不需要 Obsidian、不需要 API key）。
> 2. 把插件装进真实 Obsidian、配好 Provider、用一遍黄金路径。
> 3. 进入开发循环（watch 模式 + 热重载）。
>
> 全部命令在仓库根目录执行，除非另行说明。

> 💡 **只想用，不想理解每步**？跳过下面所有手动命令，直接跑 **`./install.sh`**（macOS / Linux）或 **`.\install.ps1`**（Windows）。脚本完整覆盖本文 §0 - §2.3，最后告诉你"在 Obsidian 里点哪几下"。
>
> Provider 配置那一步（§3）目前必须手动 —— UI 在 Obsidian 设置面板里，跟着 §3 的截图描述点即可。

---

## 0. 先决条件

| 工具        | 版本     | 检查                                                          |
| ----------- | -------- | ------------------------------------------------------------- |
| Node.js     | ≥ 20     | `node --version`                                              |
| pnpm        | ≥ 11     | `pnpm --version`                                              |
| Obsidian    | ≥ 1.4.0  | 仅"装入 Obsidian"路径需要                                     |
| 一份 AI key | 任意一家 | DeepSeek / OpenRouter / 智谱 等 OpenAI 兼容；本地 Ollama 也行 |

```bash
node --version    # 期望 ≥ v20
pnpm --version    # 期望 ≥ 11
```

如果 pnpm 没装：

```bash
corepack enable
corepack prepare pnpm@latest --activate
```

---

## 1. 60 秒健康检查（推荐第一次跑）

这一步**不需要 Obsidian**、**不需要 API key**，仅用一个内存版 host 和 mock provider 把整套业务流跑一遍。完成后你能看到 10 步全绿的输出，说明系统从导入到检索的整条链路是活的。

```bash
git clone <repo>                                  # 或者你已经在 repo 里
cd aether-note-llm
pnpm install                                      # 装依赖（首次）
pnpm --filter @aether/core build                  # 编译核心包
pnpm --filter @aether/core smoke                  # 跑端到端冒烟
```

期望输出（节选）：

```
▶ 1. 实例化 AetherCore + InMemoryHostAdapter
  ✓ init() 完成
…
▶ 5. Approve Inbox 项 → 写 markdown + 索引
  ✓ 笔记落盘: Aether Inbox/notes/2026/05/id-002-swiftui-状态调试笔记.md
…
▶ 8. 模拟"重启": 索引持久化 + 恢复
  ✓ 重启后仍能检索到 1 条结果
…
=== 冒烟测试全部通过 ✓ ===
```

如果这一步报错了，**先别往下走** —— 多半是 Node 版本、pnpm 没装、或者 `pnpm install` 没跑过。脚本本身的源码在 `packages/core/scripts/smoke.mjs`，10 步都标了注释，自己读一遍能定位到具体卡哪。

---

## 2. 装到真实 Obsidian（产品形态）

### 2.1 准备产物

```bash
pnpm --filter @aether/core build       # 必须先 build core，plugin 引的是 core/dist
pnpm --filter aether-note-llm build    # 产出 packages/plugin/main.js
```

构建成功后这三个文件就是 Obsidian 需要的全部产物：

```
packages/plugin/main.js          # ~256 KB，已 minify 的 CommonJS bundle
packages/plugin/manifest.json    # Obsidian plugin manifest
packages/plugin/styles.css       # 插件 CSS（依赖 Obsidian CSS 变量）
```

### 2.2 链接到 vault

选一个**测试 vault**（推荐起名 `Aether Dev`，不要直接拿主力 vault 试 v0.1）。

```bash
# 改成你自己的 vault 绝对路径
VAULT="$HOME/Documents/Aether Dev"

PLUGIN_DIR="$VAULT/.obsidian/plugins/aether-note-llm"
mkdir -p "$PLUGIN_DIR"
ln -sf "$(pwd)/packages/plugin/main.js"       "$PLUGIN_DIR/main.js"
ln -sf "$(pwd)/packages/plugin/manifest.json" "$PLUGIN_DIR/manifest.json"
ln -sf "$(pwd)/packages/plugin/styles.css"    "$PLUGIN_DIR/styles.css"
```

> **为什么用软链**：每次 `pnpm build` 都直接更新到 vault 里的 main.js，不需要反复 cp。开发循环友好。
>
> **如果不想软链**：把上面 `ln -sf` 换成 `cp` 也行，只是每次改完代码要手动 cp 一次。

### 2.3 在 Obsidian 中启用

1. 打开 Obsidian → 打开刚才的 vault
2. `Settings`（左下齿轮） → `Community plugins`
3. 如果 `Restricted mode` 开着，关掉它（社区插件需要）
4. 滚到 `Installed plugins` 列表，找到 **Aether Note LLM** → 点开关启用
5. 验证安装成功的 3 个标志：
   - 左侧 ribbon 多了一个**搜索图标**（点击会打开 Aether Search 视图）
   - 底部状态栏出现 `Aether: Inbox 0`
   - `⌘P` 命令面板搜 "Aether" 应该看到这些命令：
     ```
     Aether: Open Search
     Aether: Open Inbox
     Aether: Import...
     Aether: Rebuild index
     Aether: Diagnostics export
     Aether: AI: Rewrite selection
     Aether: AI: Summarize selection
     Aether: AI: Extract key points
     ```

如果这些都没看到，看 `Settings → Community plugins` 里 Aether Note LLM 是否真的"已启用"（开关绿色）。仍不行，看 vault 里 `.obsidian/plugins/aether-note-llm/` 目录三个文件齐不齐。

---

## 3. 配置 Provider（**没这一步 AI 功能全部不可用**）

打开 `Settings → Aether Note LLM`。这一节决定哪些 AI 任务用哪家服务的哪个模型。

### 3.1 添加 Provider

`Providers` 区域 → `[Add provider]` 按钮。每个 Provider = 一组 `Base URL + API key`。

举几个例子（任选其一/多个）：

| 服务           | Base URL                               | 备注                                  |
| -------------- | -------------------------------------- | ------------------------------------- |
| OpenAI 官方    | `https://api.openai.com/v1`            | 国内访问需自备代理                    |
| DeepSeek       | `https://api.deepseek.com/v1`          | 国内可访问，便宜，无 embedding 模型   |
| 智谱 GLM       | `https://open.bigmodel.cn/api/paas/v4` |                                       |
| Moonshot       | `https://api.moonshot.cn/v1`           |                                       |
| SiliconFlow    | `https://api.siliconflow.cn/v1`        | 有 `BAAI/bge-m3` 等 embedding 模型    |
| OpenRouter     | `https://openrouter.ai/api/v1`         | 聚合多家，可同时拿到 chat + embedding |
| 本地 Ollama    | `http://localhost:11434/v1`            | 无需 key，运行 `ollama serve`         |
| 本地 LM Studio | `http://localhost:1234/v1`             | 无需 key                              |

填好 Name + Base URL → 点 `Edit key` 粘贴 API key → 点 **Test** 按钮：

- 弹出 `Connected. N models` → 配置正确 ✓
- 弹出 `Failed: ...` → 看错误信息修（最常见：key 错、base URL 多了 `/chat/completions` 后缀、网络）

### 3.2 设置 Feature Bindings

`Feature bindings` 区域。Aether 把 AI 调用拆成 **6 个功能**，每个独立绑定 Provider + 模型名：

| Feature          | 干什么                       | 推荐选什么                                                                                          |
| ---------------- | ---------------------------- | --------------------------------------------------------------------------------------------------- |
| `chat`           | 通用对话（v0.1 暂未使用 UI） | 任选一家 chat 模型                                                                                  |
| `embedding`      | **检索必备** 把文本转向量    | 必须选**支持 embedding** 的家。如 SiliconFlow + `BAAI/bge-m3`；或 OpenAI + `text-embedding-3-small` |
| `inbox_metadata` | 导入时帮你定标题/标签/摘要   | 任意 chat 模型，DeepSeek 性价比高                                                                   |
| `summarize`      | 编辑器选段 → AI 总结         | 任意 chat 模型                                                                                      |
| `rewrite`        | 编辑器选段 → AI 改写         | 任意 chat 模型                                                                                      |
| `extract`        | 编辑器选段 → AI 提取要点     | 任意 chat 模型                                                                                      |

> **最少配置**：只要 `embedding` 和 `inbox_metadata` 这两个 binding 设好，主流程就能跑。其他 4 个可以以后再说。
>
> **embedding 单独说**：DeepSeek、Kimi 等家**没有 embedding 模型**，所以 `embedding` binding 必须指向有 embedding 服务的 Provider。常见组合：`embedding → SiliconFlow + bge-m3`，`inbox_metadata + chat + summarize + rewrite + extract → DeepSeek + deepseek-chat`。

### 3.3 其他设置（可选）

`Advanced` 区域：

- **Aether Inbox folder**：approve 后的笔记落在 vault 的哪个子目录。默认 `Aether Inbox`。
- **Scan scope**：`Entire vault`（索引整个 vault 的 `.md` 文件，默认） / `Aether Inbox only`（只索引 Aether 自己创建的笔记）。
- **Hybrid α**：检索时文本权重 vs 向量权重。默认 0.4 偏向量；想"按关键词为主"调高（如 0.7）。
- **Rebuild index**：手动重建。如果切换了 embedding 模型、或感觉检索结果异常，按一下。

---

## 4. 黄金路径走一遍

配好 Provider 后，第一次操作建议按这个顺序走完：

### 4.1 导入

`⌘P → Aether: Import...` → 弹出 Modal → 粘贴一段你自己的笔记 / 文章 → `Import` 按钮。

期望：

- 状态栏 `Aether: Inbox N` 数字增加
- 右侧侧栏（或 `⌘P → Aether: Open Inbox`）出现一张卡片
- 卡片标题、标签、摘要都是 AI 自动写的

### 4.2 Approve

在 Inbox 视图的卡片上点 `Approve`。

期望：

- 卡片消失（状态从 pending 变为 approved）
- vault 里出现 `Aether Inbox/notes/2026/05/<id>-<slug>.md`
- 打开这个文件，frontmatter 含 `aether_id`、`aether_kind`、`title`、`tags`、`aether_summary` 等

### 4.3 搜索

`⌘P → Aether: Open Search`（或点 ribbon 搜索图标） → 输入跟笔记内容相关的词。

期望：

- 命中卡片出现（含高亮片段）
- 点击卡片自动打开对应 markdown 文件

### 4.4 段落级 AI

在任意笔记里**选中一段文字**，**右键** → 菜单底部应该有 3 个 Aether 菜单项：

- `Aether: AI rewrite`
- `Aether: AI summarize`
- `Aether: Extract key points`

任选一个 → 弹出结果 Modal → 看到原文 vs AI 输出 → 点 `Replace selection` 把 AI 结果写回编辑器。

### 4.5 书签

`⌘P → Aether: Import...` → 粘贴一段 Chrome 书签 JSON（或一行一个 URL）→ Import。

> 怎么拿到 Chrome 书签 JSON：
>
> - macOS: `cat "$HOME/Library/Application Support/Google/Chrome/Default/Bookmarks"`
> - 或者 Chrome → `chrome://bookmarks` → 整理 → 导出为 HTML（HTML v0.1 暂不支持，只支持 JSON）

期望：每条 URL 变成一个 `kind=bookmark` 的 Inbox 卡片；approve 后在搜索里点击会打开默认浏览器。

### 4.6 诊断包（debug 必备）

如果哪里出问题：

`⌘P → Aether: Diagnostics export` → 弹出 Modal，里面是 JSON 报告（API key 已脱敏）→ `Copy to clipboard` → 贴到 issue 里。

---

## 5. 开发循环

### 5.1 watch 模式（边改边自动重建）

```bash
pnpm --filter aether-note-llm dev
```

esbuild 进入 watch 状态，每次保存 `.ts` 源文件自动重建 `packages/plugin/main.js`。因为前面用了软链，vault 里的 main.js 也跟着更新。

在 Obsidian 里**手动刷新**才能加载新代码：

- 推荐：装 [Hot-Reload](https://github.com/pjeby/hot-reload) 插件，自动检测 main.js 变化并重载
- 临时：`⌘P → Reload app without saving`

### 5.2 改 core 包代码时

core 不在 esbuild watch 里（它走 tsc）。改完要：

```bash
pnpm --filter @aether/core build
```

然后 plugin 端会通过 workspace 链接自动看到新 core（仍需要刷新 Obsidian）。

### 5.3 一行命令完整自检

```bash
pnpm --filter @aether/core build && pnpm typecheck && pnpm test && pnpm --filter @aether/core smoke
```

提 PR 前跑一遍这个，跟 CI 一致。

### 5.4 单测覆盖率

```bash
pnpm --filter @aether/core test:coverage
```

报告在 `packages/core/coverage/index.html`。当前线 89% / 80% / 91%，CI 阈值 65/55。

---

## 6. 常见问题

### 6.1 `Cannot find module '@aether/core'`

**症状**：plugin typecheck 或 test 失败提示找不到 `@aether/core`。

**原因**：core 还没 build，dist/ 不存在。

**修法**：

```bash
pnpm --filter @aether/core build
```

CI 已经处理了这个顺序（见 `.github/workflows/ci.yml`），本地手动跑命令时记得 core 先 build。

### 6.2 测试连接 "Failed: HTTP 401"

API key 不对 / 没填 / 复制时多了空格。打开 `Settings → Aether Note LLM → 那个 Provider → Edit key` 重输。

### 6.3 测试连接 "Failed: HTTP 404"

Base URL 错了。**不要**带 `/chat/completions` 这种具体 endpoint 后缀，只到 `/v1` 即可。

```
对：https://api.deepseek.com/v1
错：https://api.deepseek.com/v1/chat/completions
```

### 6.4 搜索时报 `BINDING_NOT_FOUND: embedding`

`embedding` Feature 没绑 Provider。回到设置面板配上。如果暂时不想配 embedding，可以**先不搜** —— Inbox 导入和段落级 AI 不依赖 embedding。

### 6.5 搜索时报 `EMBED_DIM_MISMATCH`

切换了 embedding 模型导致维度不一致。按 `Settings → Rebuild index`，全量重建一次。

### 6.6 插件启用了，但 ribbon 图标没出现

打开 Obsidian 开发者控制台（`⌘⌥I`），看 Console 标签页有没有红字。常见原因：core dist 丢了、main.js 没正确生成。

### 6.7 mobile 上能用吗

`manifest.json` 里 `isDesktopOnly: false`，理论上能装。但 v0.1 没在移动端做手测，AI 调用可能受网络环境影响（国内移动网络访问 OpenAI 域名困难）。推荐先桌面验证再上移动。

---

## 7. 卸载

直接在 Obsidian `Settings → Community plugins` 关闭并卸载即可。**vault 里的 markdown 文件和 frontmatter 完全保留**，因为它们都是普通 Obsidian 笔记 —— Aether 卸载后这些笔记还在那儿，只是 `aether_*` frontmatter 字段失去意义（但不影响 Obsidian 解析）。

如果想彻底清掉插件持久化的索引：

```bash
rm -rf "<vault>/.obsidian/plugins/aether-note-llm"
```

---

## 8. 下一步

- 完整测试清单：[`docs/testing/strategy.md`](../testing/strategy.md) §Manual smoke
- 开发约定：[`docs/contributing/coding-standards.md`](coding-standards.md)
- 架构地图：[`docs/architecture/overview.md`](../architecture/overview.md)
- 发布流程：[`docs/contributing/release-checklist.md`](release-checklist.md)
