# Aether Note LLM — Obsidian Plugin v0.1 设计

**日期**：2026-05-16
**形态**：v0.1 = Obsidian Plugin；中期升级为独立桌面应用作为扩展位保留
**核心定位**：个人知识库 AI 检索助手，从过去的笔记 / 书签里找现在问题的解决方案

---

## §0 设计目标与边界

### 一句话产品定义

> Aether 是一个 Obsidian Plugin，把你散落各处的笔记 / 文章 / 书签智能导入 vault，并提供「问一个问题 → 从你的过往记录里找答案」的语义检索能力。

### 已澄清的需求边界（来自 brainstorming）

| 维度                  | 决策                                                                      |
| --------------------- | ------------------------------------------------------------------------- |
| **核心场景**          | 知识检索 / 经验复用 + 书签自然语言召回                                    |
| **暂不做**            | 用户画像、推荐引擎、多模态独立检索、跨资产关联引擎、跨设备协同            |
| **数据体量**          | 起点几百，架构支持几千                                                    |
| **形态**              | Obsidian Plugin（v0.1）→ 独立 Tauri 应用（未来）                          |
| **AI 介入度（写作）** | 编辑器段落级辅助：右键 AI 改写 / 总结 / 提取要点                          |
| **AI 介入度（检索）** | 渐进三级：候选列表 → RAG 总结 → Agent；v0.1 只做第一级，RAG 按钮预留      |
| **书签来源**          | 导入 JSON 文件 / 粘贴 JSON 文本；点击跳转默认浏览器                       |
| **模型接入**          | OpenAI 兼容协议为主，多 Provider 配置 + 每功能独立选模                    |
| **检索栈**            | orama（纯 JS 向量 + BM25）；markdown 为真相源；可随时重建索引             |
| **导入管道**          | 默认整篇入库 + AI 加 frontmatter；"智能拆多篇" 作为用户主动触发的高级功能 |
| **MVP 完成标准**      | 所有用户路径可用；AI 主要服务检索，写作辅助只做"段落级右键菜单"这一档     |

### 非目标

- 不做完整 AI 聊天面板（Cherry Studio 那种对话界面）
- 不做实时 inline suggestion（Cursor 式陪写）
- 不做协同 / 分享
- 不做云同步（用户用 iCloud / Syncthing / Obsidian Sync 自行解决）
- 不做移动端独立打包（Obsidian 移动端复用现成）

---

## §1 整体架构

### 三层结构

```
┌──────────────────────────────────────────────────────────┐
│  Obsidian (host)                                          │
│  - Vault API (file IO, MetadataCache)                     │
│  - Editor (CodeMirror 6 with Obsidian extensions)         │
│  - Workspace (panels, modals, settings tab)               │
└────────────────────────┬─────────────────────────────────┘
                         │ Plugin API
┌────────────────────────▼─────────────────────────────────┐
│  Aether Plugin (薄壳层)                                   │
│  - Views: InboxView, SearchView, SettingsTab              │
│  - Commands: import, search, ai-rewrite, ai-summarize     │
│  - Editor extensions: 右键菜单, command palette           │
│  - Lifecycle: onload / onunload / settings persistence    │
└────────────────────────┬─────────────────────────────────┘
                         │ ES module import
┌────────────────────────▼─────────────────────────────────┐
│  @aether/core (业务核心包, 独立 npm)                       │
│  - ImportPipeline (Source Connectors + Inbox 状态机)       │
│  - SearchEngine (orama + Obsidian MetadataCache 融合)      │
│  - ProviderRegistry + FeatureBinding (AI 接入抽象)         │
│  - IndexStore (orama + 持久化序列化)                       │
│  - 完全无 Obsidian 依赖, 通过 IHostAdapter 接口与外壳交互   │
└──────────────────────────────────────────────────────────┘
```

### 关键架构决策

**① `@aether/core` 是核心**

- 独立 npm 包，**不依赖 Obsidian API**
- 通过 `IHostAdapter` 接口与外壳通信（读文件 / 写文件 / 通知用户 / 打开 URL 等）
- Obsidian Plugin 提供一个 `ObsidianHostAdapter` 实现
- 未来独立 Tauri 应用提供 `TauriHostAdapter` 实现，**core 包零修改复用**

**② Plugin 层只做"翻译"**

- 把 Obsidian 的 vault file 翻译成 core 能理解的 Note 对象
- 把 core 的事件翻译成 Obsidian 的 Notice / View 更新
- 不写业务逻辑，所有业务在 core

**③ 数据真相源仍是 markdown**

- 所有笔记是 vault 里普通的 `.md` 文件
- frontmatter 标准遵守 Obsidian 约定 + Aether 私有字段（`aether_id`, `aether_kind`）
- 用户随时可以禁用 Plugin，所有 markdown 文件仍然是 Obsidian 原生笔记，零数据锁定

**④ 索引文件单独存放**

- 索引 + 向量数据序列化到 `.obsidian/plugins/aether-note-llm/data/index.json`
- 任何时候删除该文件，Plugin 重启后能从 markdown 全量重建（仅向量需要重新调 Embedding API）

### 两个代表性数据流

**场景 A：用户搜索"如何调试 SwiftUI 状态丢失"**

```
SearchView 输入框
  → core.search(query)
      ├─ HostAdapter.aiEmbed(query) → 通过 ProviderRegistry 走 fetch
      └─ orama.search({ term, vector, mode: 'hybrid' })
  → 候选列表（note / bookmark 混排）
  → SearchView 渲染卡片 + 命中片段高亮
```

**场景 B：用户拖入一份导出的 markdown 大文件**

```
ImportModal 拖拽接收
  → core.import({ source: 'file', path })
      ├─ SourceConnector 解析 (markdown / notion-zip / 纯文本)
      ├─ 默认作为一篇整文档进入 Inbox（不自动拆分多篇）
      ├─ AI 提取 frontmatter (title / tags / summary) 并查重
      └─ 写入 InboxStore (pending 状态)
  → InboxView 展示卡片
  → 用户 approve → core 写 vault 文件 + 更新索引
```

### 进程边界

- 所有运行在 Obsidian Node runtime 中（renderer process + Electron sandbox）
- AI HTTP 调用直接 `fetch`，无独立 sidecar
- 长任务（批量 embedding 重建）通过 Web Worker 避免阻塞 UI

---

## §2 数据模型

### 核心实体

**Note**（vault 内一份 markdown 文件的索引投影）

```typescript
interface Note {
  id: string; // ULID, 写入 frontmatter 的 aether_id
  vaultPath: string; // vault 内相对路径
  kind: "note" | "bookmark"; // 笔记 or URL 类型笔记
  title: string;
  summary: string | null; // AI 生成的一句话摘要
  tags: string[];
  url: string | null; // kind=bookmark 时填写
  source: "manual" | "import" | "paste" | "clipping";
  sourceMeta: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
  contentHash: string; // markdown 全文 SHA-256
  indexState: "fresh" | "stale" | "indexing" | "error";
}
```

**Chunk**（笔记切片，用于向量索引）

```typescript
interface Chunk {
  id: string; // ULID
  noteId: string;
  ordinal: number; // 0-based
  headingPath: string; // "章节 > 子节"
  content: string; // 块原文
  tokenCount: number;
  embeddingModel: string; // 生成该向量的模型名
  embedding: number[]; // 向量（在 orama 索引中）
}
```

**InboxItem**（待审区卡片）

```typescript
interface InboxItem {
  id: string;
  batchId: string;
  sourceKind: "file" | "paste" | "clipping";
  sourceRef: string;
  proposedTitle: string;
  proposedTags: string[];
  proposedSummary: string;
  content: string; // markdown 正文（已经过 SourceConnector 解析）
  duplicateOf: string | null; // 疑似重复的 Note id
  status: "pending" | "approved" | "discarded" | "merged";
  createdAt: number;
  decidedAt: number | null;
}
```

**ProviderConfig**（AI 供应商配置）

```typescript
interface ProviderConfig {
  id: string;
  name: string; // 用户起的别名："DeepSeek 官方"
  baseUrl: string; // OpenAI 兼容 endpoint
  apiKeyRef: string; // 引用 keystore 中的 key id（不明文）
  defaultHeaders: Record<string, string>;
  enabled: boolean;
  createdAt: number;
}
```

**FeatureBinding**（功能 ↔ 模型映射）

```typescript
interface FeatureBinding {
  feature: "chat" | "embedding" | "summarize" | "rewrite" | "extract" | "inbox_metadata";
  providerId: string;
  modelName: string;
  params: { temperature?: number; maxTokens?: number };
}
```

### 数据模型关键决策

**① Note 与 Bookmark 统一为同一表**

- 通过 `kind` 字段区分
- 共用 Chunk / 向量 / FTS 索引
- 搜索时可按 `kind` 过滤；默认搜索结果两者混排

**② frontmatter 兼容 Obsidian 原生**

```yaml
---
aether_id: 01HXY... # Aether 私有，决定身份。可选；缺失时 fallback 到 vaultPath
aether_kind: note # note | bookmark（缺失视为 note）
title: ...
tags: [a, b] # Obsidian 原生 tag 也能识别
aether_summary: ... # 私有字段，前缀 aether_ 避免冲突
aether_source: import
aether_url: https://... # kind=bookmark 时
aether_created: 1715846400000
aether_updated: 1715846400000
---
正文 markdown
```

**所有 Aether 私有字段以 `aether_` 前缀**，与 Obsidian / 其他 plugin 完全隔离。

**身份策略（重要）**：

- **由 Aether 创建**的笔记：自动写入 `aether_id`，移动 / 重命名文件不丢索引
- **用户已有**的笔记（无 `aether_id`）：用 `vaultPath` 作为身份 fallback，索引照常工作；用户在该笔记上首次执行 Aether 操作（如 AI 改写）时**询问是否补全 `aether_id`**，默认接受
- 这种策略让 Aether 可以索引整个 vault 而不侵入用户已有笔记，但保留长期稳定身份的升级路径

**③ Chunk 重生策略**

- Note 内容变化 → 重新切片 → 旧 Chunk 删除，新 Chunk 标记 `indexState: indexing`
- Embedding 模型切换 → 所有 Chunk 标记 `stale`，后台 worker 分批重算

**④ 不为书签做独立子系统**

- 一条书签 = `kind: 'bookmark'` 的 Note
- 笔记正文是空的或写一段用户备注
- frontmatter 的 `aether_url` 持有真实 URL
- 点击书签搜索结果 → 调用 `HostAdapter.openExternal(url)`

**⑤ API key 不入 vault**

- key 存 Obsidian Plugin Data（不进 vault `.md` 文件）
- Obsidian Plugin Data 在 `.obsidian/plugins/aether-note-llm/data.json`
- v0.1 加密强度仅为简单混淆（用户机器锁定），不上 keychain（Obsidian 移动端无 keychain）
- 文档明确告知用户：**不要将 vault 公开分享，包含敏感配置**

---

## §3 存储布局

### Plugin 安装后的目录形态

```
<MyVault>/                              ← 用户的 Obsidian Vault
├── .obsidian/
│   └── plugins/
│       └── aether-note-llm/
│           ├── main.js                 ← Plugin 入口（含 @aether/core 打包）
│           ├── manifest.json
│           ├── styles.css
│           ├── data.json               ← Plugin settings（含 Provider 配置, API key）
│           └── data/                   ← Plugin 私有数据目录
│               ├── index.json          ← orama 索引序列化
│               ├── vectors.bin         ← 大量浮点向量分离存储（可选优化）
│               ├── inbox.json          ← InboxItem 持久化
│               ├── batches/            ← 导入 staging 备份
│               │   └── <batch_id>/
│               ├── logs/
│               │   └── plugin.log
│               └── backups/            ← index.json 自动备份（保留近 5 份）
│                   └── index-2026-05-16T22.json
│
├── Aether Inbox/                       ← 用户的 Aether 工作目录（默认）
│   ├── README.md                       ← 首次创建时生成的引导文档
│   ├── notes/                          ← approve 后的笔记落地处
│   │   └── 2026/05/
│   │       └── 01HXY-swiftui-state.md
│   └── bookmarks/                      ← 书签类 Note 落地处
│       └── 2026/05/
│           └── 01HXZ-tauri-docs.md
│
└── <用户自己原有的其他笔记>             ← Aether 也能索引这些（用户决定范围）
```

### 存储策略

**① 索引文件在 Plugin Data 目录，不污染 vault**

- 用户在 Files 面板看不到索引文件，避免误删
- vault 的 sync / backup 工具默认会同步 `.obsidian/`（如 Obsidian Sync），所以索引天然跨设备

**② markdown 文件按"年/月"自动分层**

- 单目录文件数受控
- 文件名 = `<ULID-prefix>-<slug>.md`
- 用户可手动建子目录，索引层不关心物理布局，靠 frontmatter 的 `aether_id` 关联

**③ Aether 工作目录可配置**

- 默认 `Aether Inbox/`，用户可在 settings 改
- 也允许指向 vault 根目录（不建子目录）
- 索引扫描范围在 settings 中独立配置：默认整个 vault，可改为仅 `Aether Inbox/`

**④ 备份策略**

- 每天首次启动 + 每 100 次写操作触发一次 `index.json` 备份
- 保留近 5 份，超出删最老
- 用户可在 settings 手动触发"立刻备份"

**⑤ 自描述设计**

- README.md 在首次创建 Aether Inbox 时自动生成，向用户说明：
  - 这个目录的用途
  - 索引文件存在哪里
  - 如何卸载（删 Plugin 即可，所有 markdown 文件保留）

---

## §4 导入管道

### MVP 范围（修订后）

| 来源类型                             | 支持级别  | 实现方式                                                    |
| ------------------------------------ | --------- | ----------------------------------------------------------- |
| **拖入单个 markdown 文件**           | ✅ MVP    | 解析 → frontmatter 提取 → 整篇入库                          |
| **拖入文件夹（批量 md）**            | ✅ MVP    | 遍历 → 每个文件作为独立 InboxItem                           |
| **粘贴文本 / markdown**              | ✅ MVP    | 直接作为 InboxItem                                          |
| **Notion 导出 ZIP**                  | ✅ MVP    | 解 ZIP → markdown + assets 分离 → 批量入 Inbox              |
| **浏览器书签 JSON（Chrome / Edge）** | ✅ MVP    | 解析层级 → 每条 URL = 一个 `kind: bookmark` 的 InboxItem    |
| **粘贴 URL 列表**                    | ✅ MVP    | 每行一个 URL → 自动抓取 title → bookmark InboxItem          |
| **Obsidian vault 导入**              | 🟡 V0.2   | 当前 vault 已经是 Obsidian，迁移其他 vault 通过文件复制即可 |
| **Apple Notes / 飞书**               | 🔴 暂不做 | 用户先用第三方工具导出为 markdown                           |
| **HTML / docx / PDF**                | 🔴 暂不做 | 需要 OCR / 解析器，超出 MVP                                 |

### 端到端流程

```
[1] 触发: ImportModal (Command Palette "Aether: Import")
        ↓ 用户拖文件 / 粘贴 / 选 ZIP
[2] SourceConnector 解析:
    ├─ MarkdownConnector: 单文件或目录遍历
    ├─ NotionZipConnector: 解压 + 路径映射 + assets 提取
    ├─ BookmarksJsonConnector: 解析 Chrome 书签结构
    └─ PlainTextConnector: 兜底
        ↓ 输出归一化的候选条目
[3] AI 元数据补全 (并发 + 流式):
    对每个候选调 LLM (feature=inbox_metadata):
      → 生成 title / tags / summary
      → 查重（向量 + BM25）→ 标记 duplicateOf
    ↓
[4] 写入 InboxStore (status=pending)
    通过事件通知 InboxView 增量渲染
        ↓
[5] InboxView 卡片展示，用户决策:
    ├─ Approve              → 写 vault md 文件 + frontmatter + 更新索引
    ├─ Edit then Approve    → 用户改完再写
    ├─ Merge into existing  → append 到 duplicateOf 指向的 Note
    └─ Discard              → status=discarded（保留记录，可恢复 30 天）

[6] 批次状态: importing → ready → archived（所有 pending 处理完）
```

### 修订后的关键约束

**① 默认"整篇入库"，不自动拆分**

- 用户拖入大文档 → 默认整篇作为一个 Note + AI 加 frontmatter
- 想拆分？右键已有笔记 → "Aether: Split this note" 触发专门流程
- 这避免了"LLM JSON 输出不可控"作为 MVP 阻塞点

**② AI 元数据补全可选**

- 没配 Provider / API key → 跳过 AI 步骤，直接用文件名作 title、空 summary、空 tags
- 用户在 Inbox 里仍可手动编辑
- **AI 缺席 ≠ 功能不可用**

**③ 流式增量渲染**

- LLM 调用并发上限默认 3 个
- 每条完成立刻 emit 事件 → InboxView 卡片即时出现
- 不等全部完成才能开始审核

**④ 查重双路打分**

- 向量 cosine ≥ 0.92 → 强嫌疑
- BM25 top-1 命中 + 分数阈值 → 弱嫌疑
- 任一命中 → 卡片显示"疑似与《...》重复，要不要合并？"
- 用户可无视提示，作为新笔记入库

**⑤ Inbox 容量保护**

- 单批超过 200 条 → 暂停 AI 元数据补全，让用户先处理已生成的
- 防止巨型导入跑飞 token

**⑥ 成本预算可见**

- 导入前估算 token 量 + 预计花费（基于 Provider 当前 model 价格表，价格表内置常见模型）
- 弹窗"预计消耗 ~$0.X，继续？"，用户确认后才开始

**⑦ 可重入**

- batchId 持久化到 inbox.json
- Plugin 重启 / Obsidian 关闭重开 → 待审卡片仍在
- staging 备份保留到 batch archived

### Source Connectors 接口

```typescript
interface SourceConnector {
  readonly id: string;
  readonly name: string;
  canHandle(source: ImportSource): boolean;
  parse(source: ImportSource, opts: ParseOpts): AsyncIterable<RawCandidate>;
}

interface RawCandidate {
  title: string | null; // 已知则填，未知留 null 给 AI 推断
  content: string; // markdown 正文
  tags: string[]; // 来源自带 tag（如 Notion 数据库属性）
  url: string | null; // 书签类填
  assets: AssetRef[]; // 关联资源（图片等）
  sourceMeta: Record<string, unknown>;
}
```

每种来源是独立模块，便于未来加 Apple Notes / 飞书 / RSS 等不破坏现有代码。

---

## §5 检索流程

### MVP 检索路径

```
SearchView 输入框
    ↓ debounce 300ms
[1] core.search({ query, kind?, filters? })
        ↓
[2] 并行执行:
    ├─ Provider.embed(query) → vector
    └─ orama.search({
         term: query,                    // BM25 全文
         vector,                         // 向量召回
         mode: 'hybrid',
         hybridWeights: { text: α, vector: 1-α },
         limit: 40,
         where: { kind, tags, path-prefix, time-range }
       })
        ↓
[3] core 后处理:
    ├─ 同 Note 多 Chunk 命中 → 合并到 Note 级，保留最高分 Chunk
    └─ 输出: { noteId, title, summary, topChunks: [...], score }
        ↓
[4] SearchView 渲染:
    ├─ 卡片显示: title / summary / 命中片段（高亮）/ tags / kind 图标
    ├─ 点击 Note 卡片 → Obsidian workspace.openLinkText
    ├─ 点击 Bookmark 卡片 → openExternal(url)
    └─ 顶部按钮: 「让 AI 综合回答」(MVP v0.1 灰显; v0.2 实现)
```

### 检索的渐进三级

| 级别                      | 描述                                             | MVP v0.1          |
| ------------------------- | ------------------------------------------------ | ----------------- |
| **1. 候选列表**           | 双路融合，给原始片段                             | ✅ 实现           |
| **2. AI 综合回答（RAG）** | 取 top-K 片段塞入 prompt，让 LLM 生成总结 + 引用 | 🟡 v0.2，按钮预留 |
| **3. Agent 工具调用**     | LLM 多轮调用 search / 加标签 / 合并笔记          | 🔴 不在路线图     |

### 评分融合

```
final = α × normalized_text_score + (1 - α) × normalized_vector_score
(α 默认 0.4, 在设置里可调 0~1)
```

orama 内置 hybrid 模式直接支持权重融合，不需要自造。

### 过滤器

- `kind:note` / `kind:bookmark` → 类型筛选
- `#tag` → 标签筛选
- `path:Aether\ Inbox/notes/2026/*` → 路径前缀
- `after:2026-01-01` / `before:2026-05-01` → 时间范围

这些是 orama where 子句，零额外代码。

### 索引重建期间的降级

- 大量 Chunk `indexState=stale` → 顶部 banner 提示 "索引重建中 (X%)，结果可能不完整"
- α 自动升到 0.8（向量不可靠时更依赖 BM25 文本匹配，因为 α 表示文本权重）
- 用户可点 banner 看进度详情

### 空结果处理

- 双路都没命中 → 显示"未找到。是否扩大范围？" + 改写查询（v0.2 实现）

### 与 Obsidian MetadataCache 的关系

- Obsidian 已经维护了 vault 的 tag / link / heading 索引（MetadataCache）
- core 不重复造，**直接读 MetadataCache** 拿 tag / heading 信息
- core 的索引只补 Obsidian 缺的：**向量 + 全文 BM25 + Aether 私有 frontmatter**

---

## §6 Provider 子系统

### 设计思路（借鉴 Cherry Studio）

参考 Cherry Studio 的两个核心思路：

1. **Provider 列表 + 多组配置**（OpenAI 官 / DeepSeek / OpenRouter / 本地 Ollama 各一组）
2. **每个功能独立选模型**（对话用 GPT-4，Embedding 用 bge-m3，整理用 DeepSeek）

**不**借鉴：

- Cherry Studio 的对话面板（v0.1 不做完整聊天 UI）
- Cherry Studio 的智能体管理
- Cherry Studio 的多端打包

### Provider 配置（Obsidian Settings Tab）

```
Aether Note LLM
├─ Providers
│   [+ 添加 Provider]
│   ┌────────────────────────────────────┐
│   │ □ DeepSeek 官方                    │
│   │   Base URL: https://api.deepseek...│
│   │   API Key:  ●●●●●●●● [重设]         │
│   │   [测试连接 →] ✓ 已连通             │
│   │   [Headers] (可选)                  │
│   └────────────────────────────────────┘
│   ┌────────────────────────────────────┐
│   │ □ OpenRouter                       │
│   └────────────────────────────────────┘
│
├─ Feature Bindings
│   ┌────────────────────────────────────┐
│   │ 对话 / 总结回答 (chat)              │
│   │   Provider: DeepSeek 官方           │
│   │   Model:    deepseek-chat          │
│   │   温度:     0.3                    │
│   ├────────────────────────────────────┤
│   │ Embedding (向量化)                  │
│   │   Provider: SiliconFlow            │
│   │   Model:    BAAI/bge-m3            │
│   ├────────────────────────────────────┤
│   │ 段落改写 (rewrite)                  │
│   │   Provider: DeepSeek 官方           │
│   │   Model:    deepseek-chat          │
│   ├────────────────────────────────────┤
│   │ 段落总结 (summarize)                │
│   │   ...                              │
│   ├────────────────────────────────────┤
│   │ 提取要点 (extract)                  │
│   │   ...                              │
│   ├────────────────────────────────────┤
│   │ 导入元数据补全 (inbox_metadata)     │
│   │   ...                              │
│   └────────────────────────────────────┘
│
├─ 高级
│   - 同步并发上限 (默认 3)
│   - 总月度 token 预算告警
│   - 流式响应超时 (默认 60s)
│   - AI Trace 日志开关 (默认关)
```

### Provider 抽象

```typescript
interface Provider {
  readonly id: string;
  chat(req: ChatRequest): AsyncIterable<ChatChunk>;
  embed(req: EmbedRequest): Promise<EmbedResponse>;
  listModels(): Promise<string[]>;
  testConnection(): Promise<TestResult>;
}

class OpenAICompatibleProvider implements Provider { ... }
```

MVP 仅实现 `OpenAICompatibleProvider`，覆盖：

- OpenAI 官方
- DeepSeek / Kimi / Moonshot / 智谱
- OpenRouter / SiliconFlow / one-api / 各类中转
- Ollama / LM Studio（本地，base_url = `http://localhost:11434/v1`）

未来增加 Anthropic / Gemini 原生 SDK 时新 class 注册到 ProviderRegistry。

### 关键细节

**① 测试连接强制**

- 添加 Provider 时点"测试连接" → 调 `/v1/models`
- 成功才允许保存
- 返回的模型列表作为 Feature Binding 的 model 字段下拉项

**② Embedding 模型切换的连锁动作**

- Embedding Feature Binding 变化 → 弹窗：
  "切换 embedding 模型将导致所有现有向量失效，预计需要 X 分钟重建。是否后台重建？"
- 用户确认 → 所有 Chunk 标 `stale`，后台 worker 限速重算（默认 3 并发）

**③ 失败处理**

- 网络 / 5xx / 429 → 自动重试 3 次（指数退避）
- 4xx → 不重试，明确报错（"API key 错误" / "endpoint 路径错"）
- 流式中断 → 标 partial，前端给"继续"按钮

**④ Token 用量统计**

- 累加到 `data/usage.json`：`{date, providerId, feature, promptTokens, completionTokens}`
- Settings 显示当日 / 当月用量
- 超月度预算告警弹窗，**不强制断**

**⑤ AI Trace 日志**

- 默认关
- 用户开启后，每次 chat / embed 调用的 prompt + response 写入 `logs/ai-trace.log`
- 用于开发期 + 用户报 bug 时让用户主动开启复现
- 显式说明"含敏感内容，请勿公开分享日志"

---

## §7 写作辅助（段落级 AI 菜单）

### 修订后纳入 MVP 的能力

在 Obsidian 编辑器内：

```
用户选中一段文字
     ↓
右键 → Aether 菜单:
  ├─ ✨ AI 改写                  (feature=rewrite)
  ├─ 📋 AI 总结                  (feature=summarize)
  ├─ 🔑 提取要点                  (feature=extract)
  └─ 🔍 搜索相关笔记              (feature=search, 用选中内容做 query)
```

**实现方式**：

```typescript
this.registerEvent(
  this.app.workspace.on("editor-menu", (menu, editor, view) => {
    const selection = editor.getSelection();
    if (!selection) return;
    menu.addItem((item) =>
      item.setTitle("Aether: AI 改写").onClick(async () => {
        const result = await core.rewrite(selection);
        // 弹一个 Modal 展示结果，用户选 "替换" / "插入到末尾" / "取消"
        new RewriteResultModal(this.app, selection, result).open();
      }),
    );
    // ...其他菜单项
  }),
);
```

### 修订后 MVP 的 AI 体验图

| 用户旅程                         | AI 是否介入                       |
| -------------------------------- | --------------------------------- |
| 装上 Plugin                      | 无需 AI                           |
| 第一次 vault 全文检索            | BM25 即可，AI 缺席                |
| 添加 Provider + Feature Binding  | （配置环节）                      |
| 导入散落数据到 Inbox             | AI 补 frontmatter（可选）         |
| 搜索"如何..."                    | Embedding 检索（可选；BM25 兜底） |
| 编辑笔记，需要改写 / 总结 / 提取 | AI 段落级辅助                     |
| 想综合回答                       | v0.2 RAG，暂时灰显                |

每一步 AI 都是 **可选增强**，不是阻塞依赖。

---

## §8 UI 信息架构（Obsidian 内）

### 入口与视图

**① 命令面板（核心入口）**

- `Aether: Open Search` → 打开搜索视图
- `Aether: Open Inbox` → 打开待审视图
- `Aether: Import...` → 打开导入 Modal
- `Aether: Rebuild Index` → 重建索引
- `Aether: Show Stats` → 统计面板
- 编辑器选中态：`Aether: Rewrite / Summarize / Extract` → 段落级 AI

**② 侧栏视图**

- `InboxView`（Right Sidebar，独立 leaf）
  - 顶部：批次切换 dropdown + "全部接受 / 全部丢弃" 工具栏
  - 卡片瀑布流，每张卡片：
    - proposed title（可点编辑）
    - proposed tags（chip 可编辑）
    - 折叠的 content（点击展开预览）
    - duplicateOf 提示 + 合并/作为新笔记按钮
    - 底部三按钮：[接受] [编辑] [丢弃]
  - 底部进度条
- `SearchView`（Right Sidebar 或独立 leaf）
  - 大搜索框 + 过滤器 chips + α 滑杆
  - 结果列表（note / bookmark 混排或分组）
  - 卡片：title / summary / 命中段高亮 / tags / kind 图标
  - 顶部按钮：「让 AI 综合回答」(灰显)

**③ Settings Tab**

- §6 描述的 Provider / Feature Binding 配置面板
- 高级选项

**④ 状态栏（Obsidian StatusBar）**

- 索引覆盖率（已向量化 / 总 chunk）
- 今日 token 用量
- Inbox 待处理数（红点提示）

**⑤ 编辑器右键菜单**

- §7 描述的段落级 AI 菜单

### 信息架构原则

**① 不抢 Obsidian 主舞台**

- 编辑器、文件树、命令面板都是 Obsidian 原生
- Aether 只在 sidebar / 编辑器右键 / settings 提供能力

**② Inbox 红点强提示**

- 有 pending 项时，左侧 ribbon 图标加红点 + 数字
- 用户感觉"有东西在等我处理"

**③ 检索作为重点入口**

- ribbon 图标点击 → 默认打开 SearchView
- ⌘P 命令面板第一项 → "Aether: Search"

**④ UI 库选择**

- v0.1 用 Obsidian 内置 UI 元素（setting components / Modal / Notice）
- 风格继承 Obsidian 主题（用户可在 dark / light / 第三方主题间切换）
- 不引入外部 UI 库，避免主题冲突
- 复杂自定义组件用原生 DOM + Obsidian CSS 变量

**⑤ 移动端体验**

- 核心命令在 Obsidian 移动端命令面板可用
- AI 调用走移动端 fetch（注意流量 + 国内网络）
- 大量数据导入不适合移动端，settings 显式禁用

---

## §9 错误处理与可恢复性

### 故障模式与策略

| 故障                           | 检测                             | 用户体验                                            | 恢复                                     |
| ------------------------------ | -------------------------------- | --------------------------------------------------- | ---------------------------------------- |
| **Plugin 加载失败**            | Obsidian Plugin Manager 报错     | Obsidian 自带提示                                   | 用户重装 / 看日志                        |
| **索引文件损坏**               | 加载时 JSON parse 失败           | Notice + Modal 引导                                 | 从 backups/ 恢复，或全量从 markdown 重建 |
| **AI 调用失败**                | fetch 异常 / 4xx / 5xx           | Notice 明确给原因 + 配置入口                        | 用户改 Provider 后重试                   |
| **markdown 文件外部修改**      | Obsidian vault.on('modify') 事件 | 后台静默重建该文件索引                              | 自动                                     |
| **markdown frontmatter 损坏**  | YAML 解析失败                    | 笔记可读，title 用文件名兜底，标记 indexState=error | 用户修复或自动重建 frontmatter           |
| **API key 丢失**               | 调 AI 前检查                     | Modal "请重新输入 key"                              | 用户输入后重试                           |
| **Embedding 模型维度不匹配**   | 写 orama 报错                    | 阻止写入 + Notice                                   | 引导重建索引 or 回退模型                 |
| **Inbox 任务途中 Plugin 重载** | 启动时检查 inbox.json            | "上次有未完成导入，继续吗？"                        | 续跑或丢弃                               |
| **token 超月度预算**           | 调 AI 前累加检查                 | Modal 告警，可选继续                                | 用户决策                                 |
| **Obsidian 移动端无网络**      | 调 AI 前网络检测                 | Notice "离线模式，AI 不可用"                        | 仅本地检索（BM25）                       |

### 通用原则

**① 永不丢用户数据**

- markdown 文件是真相源
- 索引可重建
- Inbox discard 走"逻辑删除"，保留 30 天

**② 错误信息可执行**

- 不是 "操作失败"
- 是 "无法连接 https://... → [打开 Provider 设置]"

**③ 后台任务可观测**

- 索引重建 / Embedding 重算 → 状态栏进度
- 点状态栏看详细日志面板

**⑤ 索引重建工具**
Settings 提供 "重建全部索引" 按钮：

1. 清空 orama 索引
2. 扫描配置中索引范围内的所有 `.md` 文件（默认整个 vault；可在 settings 限定为 `Aether Inbox/`）
3. 重新切片 + 调 Embedding + 写索引（有 `aether_id` 的优先；无 `aether_id` 的用 vaultPath 兜底）
4. 进度可见、可取消、可断点续传

**⑥ 诊断包导出**
Settings 提供 "导出诊断包" 按钮 → 打包：

- 最近 7 天日志
- 索引元信息（不含向量原始数据）
- Plugin 配置（API key 脱敏）
- Obsidian / Plugin 版本
- 让用户一键 zip 发给开发者

---

## §10 测试策略

### 分层

```
┌────────────────────────────────────────┐
│ 手测 checklist (Obsidian 内手动跑)       │  ← v0.1 不做自动化 E2E
├────────────────────────────────────────┤
│ 集成测试 (@aether/core, 真实 orama)      │  ← 检索 / 导入 / 索引
├────────────────────────────────────────┤
│ 单元测试 (纯函数 / 业务逻辑)              │  ← 切片 / 评分 / URL normalize / 解析器
└────────────────────────────────────────┘
```

### 必须有的测试

**单元（@aether/core）**

- markdown 切片：标题层级正确解析，超长段进一步切
- Chrome 书签 JSON 解析：层级正确扁平化，时间字段转换正确
- URL normalize：utm 参数去除、host 大小写、trailing slash、fragment 去除
- 评分融合：双路命中加权正确
- frontmatter 解析：损坏不崩溃，兜底字段正确

**单元（Provider）**

- OpenAI 兼容响应 JSON 解析（含 streaming SSE）
- 4xx / 5xx 错误路径
- 重试逻辑 + 指数退避
- Token 用量累计

**集成（core + 真实 orama）**

- 导入 100 条 fixture 笔记 → 全文检索能命中
- 向量检索 mock embedding（返回固定向量）→ 检索结果稳定
- approve / discard / merge 各动作正确写入 InboxStore + 写文件 mock
- 删除笔记 → 索引清理
- 重建索引 → 状态正确转换

**集成（@aether/core HostAdapter）**

- 用 InMemoryHostAdapter 替代 ObsidianHostAdapter
- 测 core 不依赖 Obsidian API 任何具体行为

**手测 checklist（v0.1）**

1. 装 Plugin → enable → 看见 Aether ribbon 图标
2. 添加 Provider → 测试连接成功 → 设置 Feature Binding
3. Command Palette → "Aether: Import" → 拖入一份 markdown → InboxView 出现卡片
4. Approve 卡片 → 笔记出现在 `Aether Inbox/notes/...`
5. SearchView 输入查询 → 命中刚导入的笔记 + 高亮片段
6. 选中编辑器一段文字 → 右键 "Aether: AI 改写" → 弹出结果 Modal
7. 导入 Chrome 书签 JSON → SearchView 能搜到 → 点击在浏览器打开
8. 关闭 Obsidian 重开 → Inbox 卡片仍在，索引完好
9. 设置 → "重建全部索引" → 进度条正常 → 完成后搜索仍然命中
10. 故意写错 API key → AI 操作时 Notice 明确告知 + 引导

### 不测的

- LLM 输出质量（不可重现）
- Obsidian 自身 API 行为（信任 Obsidian）
- UI 像素级回归

### 测试基础设施

- **Fixture vault**：`tests/fixtures/sample-vault/` 含 20 条预制 markdown 笔记 + 一份 Chrome 书签 JSON + 一份 Notion ZIP 样本
- **InMemoryHostAdapter**：内存模拟文件系统 + URL 打开
- **MockProvider**：固定 chat 回包 + 固定 embedding 向量

---

## §11 未来扩展位

### 路线图

| 版本      | 主题                                                         |
| --------- | ------------------------------------------------------------ |
| **v0.1**  | Obsidian Plugin MVP（本文档范围）                            |
| **v0.2**  | RAG 综合回答 + Obsidian vault 导入 + "智能拆分这篇" 高级功能 |
| **v0.3**  | 浏览器扩展（One-Click Save Web Article）                     |
| **v0.4**  | 多 Provider SDK 原生支持（Anthropic / Gemini）               |
| **v1.0**  | 独立 Tauri 桌面应用 (基于同一 @aether/core 包)               |
| **v2.0+** | Web 部署 / 协同 / 多模态（视市场反应）                       |

### 扩展位映射

| 能力                  | 保留的接口                                                                    |
| --------------------- | ----------------------------------------------------------------------------- |
| **AI 综合回答 (RAG)** | SearchView 已经预留按钮位；Provider.chat 已经支持 messages 模式               |
| **Agent 工具调用**    | Provider 接口预留 `tool_calls` 字段（v0.1 不实现 tool registry）              |
| **独立桌面应用**      | `@aether/core` 与 Obsidian 解耦，未来由 TauriHostAdapter 调用                 |
| **浏览器扩展**        | SourceConnector 接口可扩展为 HTTP endpoint 接收                               |
| **多模态识别**        | SourceConnector + InboxItem.assets 字段已经留位                               |
| **同步（多设备）**    | markdown + 索引文件均在 vault 内，Obsidian Sync / iCloud / Syncthing 直接覆盖 |
| **音视频检索**        | 通过 transcript → 走文本通道，复用现有索引                                    |
| **多 vault**          | Obsidian 自身支持 vault 切换；Plugin 配置自动跟随 vault                       |

每个扩展位的原则：**只保证架构边界不挡路，绝不为它写一行代码**。

### 升级到独立 Tauri 应用的路径

当未来需要做独立应用时：

1. `@aether/core` 包零修改复用
2. 实现 `TauriHostAdapter`（文件 IO 走 Rust，AI 走 Node fetch 或 Tauri 前端 fetch）
3. 索引文件迁移：从 `.obsidian/plugins/.../data/` 复制到 Tauri 应用数据目录
4. markdown 文件位置：用户自选 vault，与 Obsidian 路径无关
5. Obsidian Plugin 继续维护作为 "轻量入口"，与独立应用共存（用户二选一或都装）

---

## 全文结束

设计完。这一版与 brainstorming 期间澄清的所有边界一致，且接受了产品 + 工程双视角的自我审视修订。下一步走 spec 自检 + 用户 review，然后交给 writing-plans 出实施计划。
