# 日常使用指南

> **目标读者**：已经把插件装到 Obsidian 里并配好 Provider 的用户（如果还没，先看 [`getting-started.md`](contributing/getting-started.md) §1-3）。
>
> 这份文档不讲怎么装，只讲**装好之后日常怎么用**：7 个真实场景 + 8 个常见坑。

---

## 场景一：第一次启动，从零导入第一批资料

**目标**：把 10-50 篇散落的笔记 / 文章塞进 vault，开始用 Aether。

1. **准备素材**。哪些来源都行：
   - 散落的 `.md` 文件（Obsidian 之外的 Bear、Typora、VSCode 写的）
   - 网页文章正文（手动复制粘贴）
   - Notion 数据库导出的 markdown ZIP（解压后用拖拽或粘贴单个文件方式）
2. **第一次小试**：先**只导一篇**，确认整条链路工作。
   - `⌘P → Aether: Import...` → 粘贴一段文本 → `Import`
   - 等 1-3 秒（AI 在生成 title / tags / summary）
   - 状态栏 `Aether: Inbox 1` 出现 → 点 ribbon 搜索图标旁的 inbox 图标 → 看到卡片
3. **审核第一张卡片**：
   - 标题 / 标签 / 摘要看着合理 → 点 `Approve` → 笔记落到 `Aether Inbox/notes/2026/05/…md`
   - 不满意 → 点 `Discard`，**不会**留下文件
4. **批量导入**：单文件没问题后，可以连续粘贴 5-10 段。Inbox 视图会一张一张冒出来，你逐条审。

> **小诀窍**：第一次跑就**小批量**（不超过 10 条），看 AI 提议的质量。如果某家 chat 模型的提议你不满意，去 `Settings → Aether Note LLM → Feature bindings`，把 `inbox_metadata` 换成另一家试试。

---

## 场景二：日常吸纳新信息

**目标**：看到一篇好文章 / 写完一段思考，5 秒钟存进 Aether，让未来检索得到。

| 来源        | 操作                                                                                                                                                                                                                                            |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 网页文章    | 复制正文 → `⌘P → Aether: Import...` → 粘贴 → Import                                                                                                                                                                                             |
| 微信公众号  | 同上（复制正文部分）                                                                                                                                                                                                                            |
| 一段闪念    | 直接在 Obsidian 写在某篇笔记里，或者粘贴到 Aether Inbox                                                                                                                                                                                         |
| Chrome 书签 | `chrome://bookmarks → 整理 → 导出书签`，但 v0.1 只支持 JSON，所以**用 Bookmarks 文件位置导出**：<br>macOS: `cat "$HOME/Library/Application Support/Google/Chrome/Default/Bookmarks" \| pbcopy`<br>然后 `⌘P → Aether: Import...` → 粘贴 → Import |
| URL 列表    | 一行一个 URL，整段粘贴。Aether 自动按 URL 列表识别                                                                                                                                                                                              |

**审 inbox 的节奏**：建议每天集中审一次（睡前 / 通勤）。Inbox 是"待消化区"，积压 50+ 条不会出问题（v0.1 上限 200/批），但拖太久会忘记上下文。

---

## 场景三：检索过往经验

**目标**："上次解决 SwiftUI 状态丢失是怎么搞的来着？"

1. `⌘P → Aether: Open Search`（或点 ribbon 搜索图标）
2. 输入查询 → debounce 300ms 后自动搜
3. 看候选卡片：
   - 标题 / 摘要 / **命中片段高亮**
   - 点击 → 自动打开对应笔记
4. 觉得结果太"语义"（找不到关键词精确匹配）→ 拉一下侧栏 α 滑杆向 1.0（偏文本）
5. 觉得结果太"字面"（漏掉同义说法）→ 拉 α 向 0.0（偏向量）

> **检索精度自检**：用一个**你确定写过**的笔记里的句子搜，应该看到这篇排第一。如果没有，要么是 embedding 没生效（Settings → Rebuild index 试试），要么是 α 调得离谱。

---

## 场景四：从书签快速跳转

**目标**：以前存过一个 SwiftUI 调试技巧的网页，想再打开它。

1. 搜索关键词，结果里 kind 为 `bookmark` 的卡片有 🔖 图标（取决于主题）
2. **点击卡片** → Aether 调系统默认浏览器打开原 URL
3. 浏览器关键词高亮不是 Aether 的事，自己在浏览器里 `⌘F`

> **同样的搜索框 = 笔记 + 书签混搜**。v0.1 没有"只搜书签"按钮（v0.2 候选）。临时方案：在搜索词后面加上 ` site:某域名` 这种约定 —— 但 v0.1 还没实现，所以只是混搜。

---

## 场景五：写笔记时让 AI 帮个忙

**目标**：写到一半某段说不清，让 AI 改写 / 总结 / 提要点。

1. 在任意笔记里**选中一段文字**（一个段落最佳，太长 AI 会糊弄）
2. **右键**菜单底部三个 Aether 选项：
   - `Aether: AI rewrite` — 改写得更清晰
   - `Aether: AI summarize` — 浓缩成 1-3 句
   - `Aether: Extract key points` — 提成 bullet 要点列表
3. 弹出 Modal 显示原文 vs AI 输出
4. 满意 → `Replace selection`；不满意 → `Discard` 或重试

> **诀窍**：rewrite 默认是 neutral style；如果想要更"简洁"的风格，目前 v0.1 没暴露 style 参数到 UI（代码里支持，是 v0.2 候选）。临时方案：先 `Extract` 拿要点，再手动重写。

---

## 场景六：长期使用 / 索引维护

**目标**：用了一个月，发现搜索"感觉变笨了"，或者想换个 embedding 模型。

### 何时该重建索引

| 信号                                    | 推荐操作                                     |
| --------------------------------------- | -------------------------------------------- |
| 切换了 embedding 模型                   | **必须重建**：`Settings → Rebuild`           |
| 切换了 embedding Provider               | 同上                                         |
| 大量笔记是手工编辑的而非 Aether approve | 用一次：让 Aether 把已有 markdown 都索引一遍 |
| 搜索结果变奇怪                          | 可以试一下重建                               |
| 没任何信号                              | 别瞎重建（费 token 费时间）                  |

### 重建多久

经验值：每 100 篇笔记约 5-30 秒（取决于 embedding API 延迟）。

### token 用量监控

`⌘P → Aether: Diagnostics export` → 看 `usage.monthTotal`。

- 跑了一个月觉得花的多 → 把 `summarize / rewrite / extract` 换成更便宜的模型；`embedding` 保持高质量
- 真的太多 → `Settings → 高级 → 月度 token 告警`（注：v0.1 UI 没暴露这个字段，要直接改 plugin data；v0.2 会暴露）

---

## 场景七：换设备 / 备份

**目标**：换电脑 / 多设备同步。

**Aether 的数据全部在 vault 里**，所以本质上就是同步 vault。

| 同步方式                | Aether 行为                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------- |
| iCloud Drive / OneDrive | 笔记 md 文件自动同步；插件设置在 `.obsidian/plugins/aether-note-llm/data.json` 也同步 |
| Obsidian Sync           | 同上，但需要在 sync 设置里允许同步 `.obsidian/plugins/`                               |
| Syncthing / Resilio     | 同步整个 vault 文件夹即可                                                             |
| Git                     | 把 vault 当成 git 仓库；建议把 `data.json` 加入仓库（但脱敏 API key 再 push）         |

> **API key 的脱敏**：v0.1 把 key 存在 `data.json` 里（仅本机混淆）。如果你打算 push vault 到公开仓库，先：`⌘P → Aether: Diagnostics export` 看脱敏结构 → 手动删 `data.json` 里 `apiKeys` 字段再 commit。

### 新设备初始化

1. 新设备装好 Obsidian + 同步好 vault
2. 启用 Aether 插件
3. 如果 `data.json` 同步过来了：Provider 配置自动恢复；API key **不会**自动恢复（防泄漏），需要重新粘贴一次
4. 如果索引文件 `index.json` 没同步：第一次启动 Aether 自动跑一次重建

---

## 8 个最容易踩的坑

| #   | 现象                                   | 原因                                          | 解决                                                                      |
| --- | -------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------- |
| 1   | 启用插件后 ribbon 图标没出现           | core dist 没 build / main.js 不在 plugin 目录 | `pnpm --filter @aether/core build && pnpm --filter aether-note-llm build` |
| 2   | Test connection 报 `HTTP 404`          | Base URL 多了 `/chat/completions` 后缀        | 改成只到 `/v1` 结尾                                                       |
| 3   | Test connection 报 `HTTP 401`          | API key 错 / 复制时多了空格                   | Edit key 重输；macOS 注意"智能引号"                                       |
| 4   | 搜索报 `BINDING_NOT_FOUND: embedding`  | 没绑定 embedding feature                      | Settings 里把 `embedding` 绑给一家**有 embedding** 的 Provider            |
| 5   | 切换 embedding 后搜索结果全错          | 新旧维度不匹配                                | `Settings → Rebuild index` 重建一次                                       |
| 6   | Inbox 卡片标题特别难看（一堆英文乱码） | AI 不擅长中文 / 模型太小                      | 把 `inbox_metadata` 换成更强的 chat 模型（DeepSeek / GPT-4o-mini）        |
| 7   | 导入大文件后插件卡住                   | 单批超过 200 条会暂停                         | 等当前批次审完，再点 Import 继续                                          |
| 8   | 笔记被 Aether 修改了 frontmatter       | approve 后 Aether 会写 `aether_*` 字段        | 这是设计如此；不希望 → 不要 approve 已有笔记，而是手动维护                |

---

## 附：每日使用 / 每周维护节奏

<details>
<summary>📅 推荐节奏（点开看）</summary>

**每天（5 分钟）**

- 看一眼状态栏 `Aether: Inbox N`，>10 就抽空审一下
- 写笔记时遇到糊涂段，选中 → 右键 AI

**每周（10 分钟）**

- `⌘P → Aether: Diagnostics export` → 看 token 用量，超预算就调模型
- 浏览器 / 阅读器里攒下的素材集中粘贴进 Inbox

**每月（一次）**

- 看 `Aether Inbox/notes/<yyyy>/<mm>/` 目录大小，太膨胀考虑归档
- 想换更强 / 更便宜的 embedding 模型 → 切完一定要 `Rebuild index`

</details>

---

## 下一步阅读

- **检索原理与 α 调优** → [`docs/architecture/overview.md`](architecture/overview.md)
- **frontmatter 字段说明** → [`docs/architecture/data-formats.md`](architecture/data-formats.md)
- **想做 UAT / 验收测试** → [`docs/testing/uat-checklist.md`](testing/uat-checklist.md)
- **想给项目贡献代码** → [`docs/contributing/coding-standards.md`](contributing/coding-standards.md)
