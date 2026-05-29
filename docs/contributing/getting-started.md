# 启动与接入指南

> **目标读者**：第一次接手 Aether Note LLM 的工程师、贡献者，或者想把插件装到 Obsidian 里试用的用户。
>
> 当前产品形态：v0.3，Hub 主面板 + Quick Start + AI Roles + 导入预览确认。

---

## 0. 先决条件

| 工具     | 版本                 | 说明                                      |
| -------- | -------------------- | ----------------------------------------- |
| Node.js  | >= 20                | 开发与构建需要                            |
| pnpm     | >= 11                | monorepo 包管理                           |
| Obsidian | >= 1.4.0             | 仅安装插件时需要                          |
| AI key   | 任意 OpenAI 兼容服务 | chat 功能需要；语义搜索建议再配 embedding |

```bash
node --version
pnpm --version
```

如果 pnpm 没装：

```bash
corepack enable
corepack prepare pnpm@latest --activate
```

---

## 1. 60 秒健康检查

这一步不需要 Obsidian，也不需要真实 API key。它用内存 host 和 mock provider 跑完整业务流。

```bash
pnpm install
pnpm --filter @aether/core build
pnpm --filter @aether/core smoke
```

期望最后看到：

```text
=== 冒烟测试全部通过 ✓ ===
```

失败时先停下来排查 Node / pnpm / install / core build，不要直接进入 Obsidian 手测。

---

## 2. 装到真实 Obsidian

建议先选一个测试 vault，例如 `Aether Dev`，不要直接用主力 vault 做首测。

### 2.1 构建插件产物

```bash
pnpm --filter @aether/core build
pnpm --filter aether-note-llm build
```

Obsidian 需要这 3 个文件：

```text
packages/plugin/main.js
packages/plugin/manifest.json
packages/plugin/styles.css
```

### 2.2 链接到 vault

```bash
VAULT="$HOME/Documents/Aether Dev"
PLUGIN_DIR="$VAULT/.obsidian/plugins/aether-note-llm"
mkdir -p "$PLUGIN_DIR"
ln -sf "$(pwd)/packages/plugin/main.js" "$PLUGIN_DIR/main.js"
ln -sf "$(pwd)/packages/plugin/manifest.json" "$PLUGIN_DIR/manifest.json"
ln -sf "$(pwd)/packages/plugin/styles.css" "$PLUGIN_DIR/styles.css"
```

用软链的好处是：每次 rebuild 后，vault 里的插件产物自动更新。

### 2.3 在 Obsidian 中启用

1. 打开测试 vault。
2. `Settings → Community plugins`，关闭 Restricted mode。
3. 找到 **Aether Note LLM** 并启用。
4. 验证：
   - 左侧 ribbon 出现 Aether Hub 图标；
   - 首次启用后打开 Hub；关闭 Hub 后重启 Obsidian 不会再次强制打开；
   - 状态栏显示已索引数量和 Provider 数量；
   - `⌘P` 打开命令面板；英文界面能看到 Open Aether Hub、Import...、Review pending imports、Organize imported notes...、Refresh index changes、Rebuild index、View recent jobs、View this month's usage、Diagnostics export；中文界面能看到打开 Aether Hub、导入...、处理待导入项、整理已导入笔记...、刷新索引变更、重建索引、查看最近任务、查看本月用量、导出诊断信息。

---

## 3. 配置 Provider 与 AI Roles

打开 `Settings → Aether Note LLM`。当前设置分为 4 段：

- `Quick Start`：首次配置入口；
- `AI Providers`：管理 OpenAI 兼容服务；
- `AI Roles`：管理总结、改写、提取、综合回答、metadata、embedding 和自定义角色；
- `Advanced`：导入目录、导入分类、隐私路由、扫描范围、alpha、月度 token 预算提醒、重建索引。

### 3.1 Quick Start 推荐路径

1. 在 Quick Start 里添加预设 Provider，例如 DeepSeek、SiliconFlow、OpenAI、Ollama。
2. 到 AI Providers 里粘贴 API key，并点击 Test。
3. AI Providers 区块顶部和每个新建 / 展开的 Provider 卡片都会显示风险提示：如果内容包含私密文件、密钥或密码，优先使用本地模型或可信自部署服务。
4. 回到 Quick Start，选择：
   - chat Provider：用于 `summarize` / `rewrite` / `extract` / `critique` / `answer` / `inbox_metadata`；
   - embedding Provider：用于语义搜索。
5. 点应用绑定。
6. 到 AI Roles 确认内置角色已绑定 Provider 和 Model。

典型组合：

| 角色类型  | 推荐                                               |
| --------- | -------------------------------------------------- |
| chat      | DeepSeek / OpenAI / OpenRouter / Kimi 等 chat 模型 |
| embedding | SiliconFlow `BAAI/bge-m3` 或 OpenAI embedding 模型 |

如果暂时没有 embedding，搜索仍可用：Aether 会降级到 BM25 文本搜索。

### 3.2 自定义 AI Role

在 `AI Roles` 中可以新建自定义角色，例如“翻译成英文”或“改成正式语气”。

关键字段：

- `Provider / Model`：实际调用哪家模型；
- `Prompt Template`：提示词模板；
- `Variables`：例如 `{{selection}}`；
- `Output Kind`：text / list / metadata / embedding；
- `Show in editor`：是否出现在编辑器右键菜单。

---

## 4. 黄金路径

### 4.1 导入

1. 打开 Hub。
2. 点 `Import`。
3. 粘贴一段文本，或选择 `.md` / `.markdown` / `.txt` / `.url` / `.json` / `.itabdata` 文件；批量导入目录时切到 `导入目录` tab 选择文件夹。
4. 点 `Import`。

期望：

- 出现解析进度；
- 解析完成后出现预览清单，可编辑标题、摘要、标签、分类，并可全选 / 全不选 / 单条勾选；
- 点击写入所选后出现统一任务进度；完成后出现结果清单，可打开文件、撤销本次导入、查看失败项；
- 文件写入 `Aether Inbox/<分类>/<yyyy>/<mm>/...md`；私密目标写入 `Aether Private Inbox/<分类>/<yyyy>/<mm>/...md`；
- Hub 最近列表出现新文件。
- 目录导入会后台逐个处理 `.md/.markdown`，顶部任务提示显示进度，完成 / 失败 / 取消会进入 `最近任务`。

当前版本导入后先预览，不需要回到旧 Inbox 逐张 approve。AI metadata 不满意时，可在预览阶段直接修改标题、摘要、标签、分类，或取消勾选不写入。导入分类在 `Advanced → 导入分类` 的可折叠卡片里维护；默认 6 类为 `教程`、`AI 提示词`、`生活`、`历史`、`工作`、`其他`。

### 4.1.1 整理已有导入笔记

1. `⌘P → 整理已导入笔记...`。
2. 填写要整理的 vault 相对目录，例如 `Aether Inbox`。
3. 可选填写起止年月，格式为 `YYYY/MM`。
4. 先生成预览，确认当前路径、推荐分类和目标路径。
5. 勾选要移动的条目后再执行移动。

整理流程只把标题、摘要、标签和类型发给分类角色，不发送正文；失败项会保留原文件并在结果里显示失败原因。

### 4.2 搜索

1. 在 Hub 搜索框输入关键词或自然语言问题。
2. 用 `全部` / `笔记` / `书签` 过滤。
3. 点击 note 结果打开 Obsidian 文件；点击 bookmark 结果打开原 URL。

搜索策略：

- embedding 可用：BM25 + vector hybrid；
- embedding 未配置、API key 缺失或 Provider 临时失败：自动降级 BM25；
- embedding 维度不匹配：需要 `Rebuild index`。

重建索引入口（命令面板、Settings、维度不匹配提示）统一显示任务进度和完成 / 失败状态。

### 4.3 编辑器 AI

1. 在任意笔记里选中文本。
2. 右键，选择 Aether AI Role。
3. 查看 Modal 中的输出。
4. 满意后 `Replace selection`。

右键菜单里的角色来自 `AI Roles` 中启用且 `showInEditor = true` 的角色。

### 4.4 诊断

遇到问题时：

```text
⌘P → View recent jobs
⌘P → View this month's usage
⌘P → Diagnostics export
```

先看最近任务里的导入 / 重建状态、失败摘要和耗时；成本问题先看本月用量里的总 token、预算进度和功能拆分；需要深入排查时再复制脱敏 JSON 到 issue 或调试记录中。API key 会被自动脱敏。

---

## 5. 开发循环

### 5.1 watch 模式

```bash
pnpm --filter aether-note-llm dev
```

保存 TypeScript 文件后 esbuild 会重建 `packages/plugin/main.js`。如果使用软链，vault 中插件文件会同步更新。

Obsidian 仍需要手动刷新插件：

1. Settings → Community plugins → 关闭再打开 Aether；
2. 或重启 Obsidian；
3. 如果有插件热重载工具，可使用对应命令。

### 5.2 常用验证

```bash
pnpm --filter @aether/core build
pnpm --filter @aether/core test
pnpm --filter @aether/core typecheck
pnpm --filter aether-note-llm typecheck
pnpm --filter aether-note-llm build
```

插件 typecheck 依赖 `@aether/core/dist`，所以先 build core。

---

## 6. 常见问题

### 6.1 Test connection 报 `HTTP 404`

Base URL 通常写错了。OpenAI 兼容 endpoint 应到 `/v1`，不要写到 `/chat/completions`。

### 6.2 Test connection 报 `HTTP 401`

API key 错、复制时多了空格，或 Provider 后台没有启用对应模型。

### 6.3 搜索只有字面匹配

embedding 未配置或 Provider 不可用。搜索会继续 BM25 降级；想启用语义检索，需要绑定 embedding Role 并重建索引。

### 6.4 切换 embedding 后提示维度不匹配

不同 embedding 模型的向量维度不同。到 Settings → Advanced → Rebuild index。

### 6.5 移动端或受限环境没有“打开文件夹”按钮

打开系统文件夹依赖桌面端 Electron 能力。移动端或没有 vault `basePath` 的环境会隐藏这个按钮，导入、搜索和编辑器 AI 不受影响。

---

## 7. 下一步

- 日常使用看 [用户指南](../user-guide.md)。
- 发布前手测看 [UAT 验收清单](../testing/uat-checklist.md)。
- 架构细节看 [架构总览](../architecture.md)。
