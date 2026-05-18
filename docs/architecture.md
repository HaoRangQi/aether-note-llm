# Aether Note LLM — 架构总览（v0.2 起）

> **接手须知**：本文档是接手第一站。读完应能 1 小时内回答：东西在哪、怎么改、改了不会炸。

---

## 1. 总体形态

```
┌─────────────────────────────────────────┐
│  packages/plugin   Obsidian 集成层      │   只做 UI 和宿主桥接
│  ├─ views/hub-view.ts   ← 唯一日常面板  │
│  ├─ settings-tab.ts     ← 4 段式设置    │
│  ├─ modals/*            ← 弹窗          │
│  └─ host-adapter.ts     ← 适配 Obsidian │
├─────────────────────────────────────────┤
│  packages/core     纯逻辑、无宿主依赖   │   全部业务、可被 CLI / Web 复用
│  ├─ roles/         ← 新核心：AI 角色    │
│  ├─ provider/      ← AI 服务商抽象      │
│  ├─ search/  import/  index-store/      │
│  └─ ai/            ← 调用模板（薄）     │
└─────────────────────────────────────────┘
```

**架构约束**：
- core 不能 `import "obsidian"`。所有宿主能力走 `IHostAdapter`。
- plugin 不持业务逻辑。任何"算什么、怎么算"的判断都要在 core。
- UI 文案统一走 `i18n/`，禁止硬编码中文/英文字符串。

---

## 2. 关键概念：AI 角色（AiRole）

> v0.2 起取代 `FeatureBinding`。是整个 AI 能力的核心抽象。

### 心智模型

把每一种 AI 操作（总结、改写、提取要点、为导入生成元数据、嵌入向量…）都看作一个**可配置的「角色」**：

```ts
interface AiRole {
  id: string;              // 内置 fixed: "summarize"; 自定义: ulid
  builtIn: boolean;        // 内置不能删，可禁用
  name: string;            // 显示名（i18n key 或字面）
  icon: string;            // lucide 图标名
  description: string;
  
  providerId: string;      // 关联到哪个 Provider
  modelName: string;
  
  promptTemplate: string;  // 含 {{variable}} 占位符
  variables: string[];     // 声明用到了哪些变量
  
  outputKind: "text" | "list" | "metadata" | "embedding";
  // ↑ 决定结果如何被消费；扩展时新增此 union 成员，并在 ai/run.ts 加分支
  
  params: Record<string, unknown>;  // 开放式：temperature/maxTokens/...
  
  enabled: boolean;        // 关掉 = 调用方拿不到这个 Role
  showInEditor: boolean;   // 是否出现在编辑器右键菜单
  
  createdAt: number;
  updatedAt: number;
}
```

### 5 个内置角色（id 与原 Feature 对齐，方便迁移）

| id                | outputKind | 编辑器右键 | 说明 |
|-------------------|------------|-----------|------|
| `summarize`       | text       | ✅        | 总结选中文本 |
| `rewrite`         | text       | ✅        | 改写选中文本 |
| `extract`         | list       | ✅        | 提取要点为 bullet 列表 |
| `inbox_metadata`  | metadata   | ❌        | 给导入项目生成 title/tags/summary（JSON） |
| `embedding`       | embedding  | ❌        | 文本向量化（无 promptTemplate） |

> **embedding 是特例**：`promptTemplate` 为空、UI 不显示提示词编辑区。
> **chat** 不再是内置角色——它是空壳，被前面 4 个 text 类角色覆盖了；保留 ID 兼容，迁移时丢弃。

### 变量系统

`promptTemplate` 用 `{{var}}` 替换。当前支持：

- `{{selection}}` — 编辑器选中文本
- `{{title}}` — 笔记标题（如有）
- `{{tags}}` — 标签 join 字符串
- `{{url}}` — 来源 URL（书签/导入）
- `{{kind}}` — 笔记类型 note/bookmark
- `{{maxSentences}}` `{{maxPoints}}` — 调用时传入的数值

新增变量：在 `roles/render-prompt.ts` 加键，并在 `default-roles.ts` 的某个 role 里用上。

### 自定义角色

用户可在 Settings → AI 角色 → 「新建」加自己的角色（如「翻译为英文」「改成正式语气」）。
- 自定义角色 `builtIn = false`，`id` 是新 ulid
- `outputKind` 限定 `text` 和 `list`（更复杂的输出形态需要工程师在 ai/run.ts 加渲染分支）
- 启用且 `showInEditor = true` 后自动出现在编辑器右键菜单

### 为什么这样设计

- **数据驱动**：提示词是数据不是代码 → 用户能改、能加、能分享
- **id 稳定**：5 个内置 id 不变 → 迁移、模板分享、bug 报告都能引用
- **outputKind 收敛**：`run.ts` 是唯一调用入口，4 个分支收敛了所有差异
- **builtIn 标志**：UI 据此禁用「删除」，但允许「重置」回默认提示词

---

## 3. Hub 主面板（取代 Search + Inbox 视图）

```
┌──────────────────────────────────┐
│ Aether    [● Ready · 已索引 N]   │
├──────────────────────────────────┤
│ 🔍 [搜索框]                       │
│ [全部][笔记][书签]                │
├──────────────────────────────────┤
│ ⚡ [📝 快速记录] [📥 批量导入]    │
├──────────────────────────────────┤
│ 📌 最近 7 天                      │
│  - 卡片1 · 2h 前                  │
│  - 卡片2 · 昨天                   │
└──────────────────────────────────┘
```

### 数据来源（重要）

- **「最近」区**：直接调 `host.listMarkdown(aetherInboxFolder)`，按 mtime 倒序，不依赖索引（即使索引坏了也能工作）。
- **搜索结果**：调 `core.search(...)`，原 SearchEngine 不变。
- **状态条**：`core.store.allChunks().length` + Provider 配置数。

### 为什么删除 Inbox 视图

v0.1.2 起导入直接走 auto-approve，文件直写 vault。Inbox 待审核已经是**僵尸状态**——99% 时间是空的。删掉视图、删掉相关 i18n 和命令。

> 反向兼容：用户老的 workspace.json 可能保留了 inbox-view-type 的 leaf 引用——Obsidian 会显示「未知视图」并自动忽略，不会崩。

---

## 4. Settings 4 段式

```
设置 → Aether Note LLM
├─ 🚀 快速开始    (Quick Start)   首次必到，一屏配完
├─ 🔌 AI 服务商   (Providers)
├─ 🎭 AI 角色     (Roles)         ← 新
└─ ⚙️ 高级       (Advanced)
```

### Quick Start 一屏完成（Onboarding）

1. 选预设（DeepSeek/SiliconFlow/OpenAI/Ollama/Custom）
2. 贴 API Key
3. 自动测试连接 + 抓模型列表
4. 自动应用推荐 Roles 绑定（chat 系全用同一个 Provider；embedding 优先用支持 embedding 的预设）
5. 显示「✓ 配置完成，回到 Hub 开始用」

> Onboarding 是**幂等**的——重复进入只更新已有 Provider，不会重复创建。

### AI 角色编辑器

抽屉/Modal 形态，含：
- 图标、名称、描述
- Provider/Model 下拉
- 提示词编辑器（textarea + 变量提示）
- 高级参数（折叠：temperature/maxTokens）
- 「用当前选中文本测试」按钮（直接调一遍 RoleRegistry 看输出）
- 「重置默认」按钮（仅内置可见）
- 保存 / 取消

---

## 5. 数据流（关键链路）

### 链路 A：编辑器右键 → 改写

```
用户选中文本
  ↓
editor-menu 事件
  ↓
plugin/commands.ts 读 RoleRegistry，过滤 enabled && showInEditor
  ↓
点击某 Role → core.runRole(roleId, {selection, ...})
  ↓
core/ai/run.ts 取 Role → renderPrompt → registry.getProvider → chat 流式
  ↓
按 outputKind 解析（text/list/metadata）
  ↓
RewriteResultModal 展示，用户接受/拒绝
```

### 链路 B：导入 → 元数据生成

```
ImportModal 提交
  ↓
core.importSource(source) → ImportPipeline
  ↓
每个 RawCandidate → core.runRole("inbox_metadata", {content, ...})
  ↓
JSON 解析 → MetadataProposal
  ↓
addItem(InboxItem) → 自动 approve → 写 vault 文件
```

### 链路 C：Hub 搜索

```
Hub 输入框 input 事件 (debounce 300ms)
  ↓
core.search({ query, alpha })
  ↓
SearchEngine 先文本搜，alpha > 0 且有 embedding 配置时叠加向量搜
  ↓
合并、排序、返回 SearchHit[]
  ↓
渲染卡片
```

---

## 6. 持久化

- `data.json`（plugin data）：
  - `settings.json` → `PersistedSettings`（含 `roles[]`）
  - `inbox.json` → `PersistedInbox`（导入待审核遗留，逐步退场）
  - `index.json` → `PersistedIndex`
- vault 文件：approve 后实际笔记 markdown 文件

### Schema 演进

- `schemaVersion: 1` 之外新增 `2`（v0.2 起，包含 `roles[]`）
- `migrateSettings` 必须处理 v1 → v2 的迁移：
  1. 老 `bindings[]` 按 5 个内置 Role 映射成 `roles[]`
  2. 老的 `bindings` 字段保留为空数组（向后兼容字段，但不再被读取）
  3. 用户从未设过 binding 时，`roles[]` 用全部默认（仅 promptTemplate，没有 providerId）

---

## 7. 文件清单（新增/重构/删除）

### 新增
```
packages/core/src/roles/
  ├─ types.ts                # AiRole 定义
  ├─ default-roles.ts        # 5 个内置 + 提示词
  ├─ render-prompt.ts        # 变量替换
  ├─ role-registry.ts        # CRUD + 查询
  └─ run-role.ts             # 调用入口（按 outputKind 分流）

packages/plugin/src/
  ├─ views/hub-view.ts       # 主面板
  ├─ modals/role-editor.ts   # 角色编辑器
  └─ onboarding/quick-start.ts (作为 settings-tab 的一节)

docs/architecture.md         # 本文件
```

### 重构
```
packages/core/src/
  ├─ types.ts                # 加 AiRole, PersistedSettings 加 roles
  ├─ persistence/migrate.ts  # v1→v2 迁移
  ├─ ai/{summarize,rewrite,extract}.ts  # 改为 thin wrapper 调 runRole
  ├─ ai/metadata.ts          # 改用 runRole("inbox_metadata")
  └─ app.ts                  # 暴露 roles RoleRegistry

packages/plugin/src/
  ├─ main.ts                 # 注册 hub 视图，去掉旧两个
  ├─ commands.ts             # AI 命令改为遍历 RoleRegistry
  └─ settings-tab.ts         # 4 段式重组
```

### 删除
```
packages/plugin/src/views/search-view.ts   # 合并入 hub
packages/plugin/src/views/inbox-view.ts    # auto-approve 后已无意义
```

---

## 8. 兼容策略

- **设置文件**：v1 设置文件可被自动迁移到 v2，无数据损失
- **命令 ID**：`open-search` / `open-inbox` 保留为别名，都打开 hub-view
- **视图类型**：旧 `aether-search-view` / `aether-inbox-view` 不再注册——Obsidian 处理孤儿 leaf
- **提示词**：内置角色提示词会持久化到 settings；用户改过的不会被升级覆盖

---

## 9. 扩展指南（给以后的人）

### 新增一个内置角色
1. `default-roles.ts` 加条目（含 promptTemplate 和默认 outputKind）
2. 在 `migrateSettings` 的初始化 roles 时把它带进去
3. 不需要改其他代码——UI 自动渲染、调用自动可用

### 新增一种 outputKind（如 `code`、`json`）
1. `types.ts` 扩 union
2. `run-role.ts` 加分支处理（怎么解析、怎么呈现）
3. 角色编辑器对应的输出预览组件加分支

### 新增一种变量
1. `render-prompt.ts` 的 `KNOWN_VARS` 加键
2. `runRole` 的调用方传 context 时填充
3. 角色编辑器的「可用变量」提示同步更新

### 新增一个 Provider 预设
1. `provider/presets.ts` 加条目
2. 不需要改 RoleRegistry——预设只影响 ProviderConfig

---

## 10. 测试约定

- **core**：所有业务逻辑必须有单测；不依赖 Obsidian
- **plugin**：只测纯函数（如 host-adapter 的路径处理）；UI 行为靠手测
- 新增 Role 必须配最小测试：模板渲染 + outputKind 分流

---

## 11. 版本

- v0.1.x：FeatureBinding 模型
- v0.2.0：AiRole 模型（本次重构）
- 升级路径：自动迁移，无人工介入

---

> **遇到不确定时**：读 `default-roles.ts` 看默认提示词、读 `run-role.ts` 看调用入口、读 `migrate.ts` 看 schema 演进。
