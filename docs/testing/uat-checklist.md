# UAT 验收测试清单

> **用途**：每次发布前 / 接手新环境 / 怀疑功能退化时，照这份清单**一步步打勾**，确认所有用户路径仍可用。
>
> 跟 [`docs/testing/strategy.md`](strategy.md) 的关系：strategy 讲"我们怎么测"，本文档是**可执行的、有打勾位的、按时间顺序排好的操作流程**。
>
> 这份是**给真人按着做的**，不是 CI 自动跑的。预计完整跑完 30-60 分钟。

---

## 测试准备

### 环境

- [ ] 干净的 Obsidian vault（建议起名 `Aether QA`）
- [ ] Node ≥ 20、pnpm ≥ 11
- [ ] **两家不同的** OpenAI 兼容 Provider 真实 key（推荐 DeepSeek + SiliconFlow，覆盖 chat 与 embedding）
- [ ] 测试用素材准备好（见下）

### 素材清单（提前放在剪贴板或本地文件夹）

| 编号 | 类型             | 内容                                                                                     |
| ---- | ---------------- | ---------------------------------------------------------------------------------------- |
| M1   | 短文本（中文）   | 一段 5-8 句的中文（举例：一篇关于"如何调试 SwiftUI 状态丢失"的经验记录）                 |
| M2   | 短文本（英文）   | 一段 5-8 句的英文                                                                        |
| M3   | 长文本           | 1000+ 字的文章                                                                           |
| M4   | 损坏 frontmatter | `---\ntitle: [unclosed\n---\nbody`                                                       |
| M5   | Chrome 书签 JSON | 真的从 `$HOME/Library/Application Support/Google/Chrome/Default/Bookmarks` 取一份        |
| M6   | URL 列表         | 5 个 URL，含 1 个带 utm 跟踪参数的重复                                                   |
| M7   | Notion ZIP 条目  | 从 Notion 真实导出（含 32-hex id 后缀的文件名）；如没有 → 用 `tests/fixtures` 里 fixture |

---

## 阶段 0：自动化冒烟（先跑这个）

不需要 Obsidian、不需要 API key。

- [ ] **T0.1** `pnpm install` 成功
- [ ] **T0.2** `pnpm --filter @aether/core build` 成功
- [ ] **T0.3** `pnpm typecheck` 全绿
- [ ] **T0.4** `pnpm test` 显示 `153 passed`
- [ ] **T0.5** `pnpm --filter @aether/core test:coverage` 显示 lines ≥ 65%、branches ≥ 55%
- [ ] **T0.6** `pnpm --filter @aether/core smoke` 输出 `=== 冒烟测试全部通过 ✓ ===`
- [ ] **T0.7** `pnpm --filter aether-note-llm build` 产出 `packages/plugin/main.js`，大小约 250-280 KB

> **任何一步失败 → 停下来排查，不要进入阶段 1**。

---

## 阶段 1：安装与启用

- [ ] **T1.1** 软链插件三件套到 `<vault>/.obsidian/plugins/aether-note-llm/`
- [ ] **T1.2** Obsidian 打开 QA vault，Settings → Community plugins → 关闭 Restricted mode
- [ ] **T1.3** Aether Note LLM 出现在 Installed plugins 列表
- [ ] **T1.4** 点开关启用 → **无报错**（控制台 `⌘⌥I` 没有红字）
- [ ] **T1.5** 左侧 ribbon 出现搜索图标
- [ ] **T1.6** 底部状态栏出现 `Aether: Inbox 0`
- [ ] **T1.7** `⌘P` 搜 "Aether" 至少出现 8 个命令

---

## 阶段 2：Provider 配置

- [ ] **T2.1** Settings → Aether Note LLM → 看到 Providers / Feature bindings / Advanced 三段
- [ ] **T2.2** 点 `Add provider` → 出现新空 Provider 行（默认名 "New provider"）
- [ ] **T2.3** 改 Name 为 `DeepSeek`，Base URL 为 `https://api.deepseek.com/v1`
- [ ] **T2.4** 点 `Edit key` → 弹出 ApiKeyModal → 粘贴 key → Save
- [ ] **T2.5** 点 `Test` → 看到 `Connected. N models`（N ≥ 1）
- [ ] **T2.6** **故意输错 key**：Edit key → 随便改几个字符 → Save → Test → 看到 `Failed: HTTP 401` 或类似
- [ ] **T2.7** 恢复正确 key
- [ ] **T2.8** 再 Add 第二家 Provider（SiliconFlow），同样跑通 Test
- [ ] **T2.9** Feature bindings 区：
  - [ ] `embedding` 绑 SiliconFlow + `BAAI/bge-m3`
  - [ ] `inbox_metadata` 绑 DeepSeek + `deepseek-chat`
  - [ ] `summarize / rewrite / extract` 都绑 DeepSeek + `deepseek-chat`
- [ ] **T2.10** Advanced 区：
  - [ ] 看到 Aether Inbox folder = `Aether Inbox`
  - [ ] 看到 Scan scope = `Entire vault`
  - [ ] 看到 Hybrid α = 0.4

---

## 阶段 3：导入路径

### 3.1 粘贴文本

- [ ] **T3.1.1** `⌘P → Aether: Import...` → Modal 弹出
- [ ] **T3.1.2** 粘贴 **M1**（中文段） → 点 Import → Modal 关闭
- [ ] **T3.1.3** 1-3 秒后 toast `Imported 1 item(s) to Inbox`
- [ ] **T3.1.4** 状态栏变成 `Aether: Inbox 1`
- [ ] **T3.1.5** 打开 Inbox 视图（命令面板或左侧），看到 1 张卡片
  - [ ] 卡片标题**与 M1 内容相关**（不是文件名）
  - [ ] 卡片有 1-5 个标签
  - [ ] 卡片有一段摘要
  - [ ] 没有 `Possible duplicate of...` 警告

### 3.2 重复内容查重

- [ ] **T3.2.1** **第二次**粘贴 **M1**（完全相同） → Import
- [ ] **T3.2.2** Inbox 出现新卡片，**应有** `Possible duplicate of an existing note.` 警告
  - 但 v0.1 在 approve 阶段，duplicate_of 指向已 approved 的笔记。仅在前一张已经 approve 后才会触发。如果前一张还在 pending，这里**不**应该报重复（设计如此）

### 3.3 Markdown 多文件

- [ ] **T3.3.1** 准备 3 个 `.md` 文件（含 / 不含 frontmatter 各一）
- [ ] **T3.3.2** 在 Obsidian 之外（Finder）选中拖入 Aether Import Modal **或** 把内容逐个粘贴
- [ ] **T3.3.3** 3 张卡片出现在 Inbox

### 3.4 损坏 frontmatter

- [ ] **T3.4.1** 粘贴 **M4** → Import
- [ ] **T3.4.2** Inbox 卡片**不应崩溃**；标题用 AI 推断或 fallback；卡片可正常 approve

### 3.5 Chrome 书签 JSON

- [ ] **T3.5.1** 粘贴 **M5** JSON 内容 → Import
- [ ] **T3.5.2** Inbox 出现多张卡片，每张 kind=bookmark，含 url 字段
- [ ] **T3.5.3** **去重生效**：原 JSON 里如果有同 URL 不同 utm 参数，应只出现一张

### 3.6 URL 列表

- [ ] **T3.6.1** 粘贴 **M6**（一行一个 URL，含重复）→ Import
- [ ] **T3.6.2** 去重后的条数 = 唯一 URL 数

---

## 阶段 4：Inbox 审核

- [ ] **T4.1** 选第一张卡片，点 `Approve`
  - [ ] 卡片消失 / 状态变化
  - [ ] toast `Approved`
  - [ ] vault 出现 `Aether Inbox/notes/2026/05/<id>-<slug>.md`
  - [ ] 打开该文件，frontmatter 含 `aether_id` / `aether_kind: note` / `title` / `tags` / `aether_summary` / `aether_source: import`
- [ ] **T4.2** 选另一张卡片，点 `Discard`
  - [ ] 卡片消失
  - [ ] vault **无**新文件
- [ ] **T4.3** 状态栏 `Aether: Inbox N` 数字正确更新
- [ ] **T4.4** 把书签卡片 approve
  - [ ] 文件落在 `Aether Inbox/bookmarks/2026/05/`
  - [ ] frontmatter 含 `aether_kind: bookmark` 和 `aether_url`

---

## 阶段 5：检索

### 5.1 基础搜索

- [ ] **T5.1.1** `⌘P → Aether: Open Search` → 视图打开
- [ ] **T5.1.2** 输入跟 M1 内容相关的关键词
- [ ] **T5.1.3** 命中卡片在 300ms 后出现
  - [ ] 标题 / 摘要正确
  - [ ] 命中片段含 `<mark class="aether-hit">` 高亮
  - [ ] kind 标签清晰显示
- [ ] **T5.1.4** 点击卡片 → 笔记打开在编辑器

### 5.2 搜索书签

- [ ] **T5.2.1** 输入 T4.4 approve 的书签标题里的词
- [ ] **T5.2.2** 命中书签卡片
- [ ] **T5.2.3** 点击 → 默认浏览器打开原 URL（**不是** Obsidian 编辑器）

### 5.3 空结果

- [ ] **T5.3.1** 输入一个绝对不会命中的字符串（如 `qzwxecrv12345`）
- [ ] **T5.3.2** 显示 `No matches.`，不崩溃

### 5.4 缺 embedding 的降级

- [ ] **T5.4.1** Settings → 删掉 `embedding` 这个 Feature Binding（把 Provider 选成 `(none)`）
- [ ] **T5.4.2** 回到搜索 → 输入关键词
- [ ] **T5.4.3** **应该报** `BINDING_NOT_FOUND: embedding` 之类的 Notice（这是预期行为）
- [ ] **T5.4.4** 把 embedding binding 加回去

---

## 阶段 6：段落级 AI

- [ ] **T6.1** 打开任意笔记，**选中一段** 50-200 字的文字
- [ ] **T6.2** 右键 → 出现 3 个 Aether 菜单项（rewrite / summarize / extract）
- [ ] **T6.3** 点 `Aether: AI summarize`
  - [ ] Modal 弹出，含 Original / Rewritten 两段
  - [ ] AI 输出**不为空** 且**是中文**（如果选中是中文）
- [ ] **T6.4** 点 `Replace selection` → 编辑器里选区被替换为 AI 输出
- [ ] **T6.5** 撤销（`⌘Z`）能恢复原文
- [ ] **T6.6** 重复 T6.3-T6.5 对 rewrite 和 extract
  - [ ] extract 的输出是 bullet 列表（以 `- ` 开头）
- [ ] **T6.7** **未选中文字时点命令** → 弹 `Select some text first` Notice

---

## 阶段 7：持久化 / 重启

- [ ] **T7.1** 当前已有若干 approved 笔记 + 1-2 个 pending inbox 卡片
- [ ] **T7.2** 关闭 Obsidian
- [ ] **T7.3** 重新打开
- [ ] **T7.4** Inbox 视图 → pending 卡片**仍在**
- [ ] **T7.5** 搜索之前用过的关键词 → 命中**仍正确**
- [ ] **T7.6** Settings → Providers / Feature bindings 配置**保留**
- [ ] **T7.7** API key **保留**（不需要重输）

---

## 阶段 8：重建 / 诊断

- [ ] **T8.1** Settings → `Rebuild index` → toast `Rebuilt: N/N files`
  - [ ] N = 当前 vault 里所有 `.md` 文件数（含 Aether 创建 + 用户原有）
  - [ ] 重建后再搜索能正常命中
- [ ] **T8.2** `⌘P → Aether: Diagnostics export`
  - [ ] Modal 弹出 JSON
  - [ ] `pluginVersion` = `0.1.0`
  - [ ] `indexCount > 0`
  - [ ] `chunkCount > 0`
  - [ ] `settings.apiKeys.*` 的值是 `<redacted>`（**关键：脱敏生效**）
  - [ ] 点 `Copy to clipboard` 后系统剪贴板含 JSON 文本

---

## 阶段 9：异常路径

### 9.1 网络失败

- [ ] **T9.1.1** 关闭网络 / 把 Provider Base URL 改成 `https://invalid.local/v1`
- [ ] **T9.1.2** 搜索一个词 → Notice 报错而**不崩溃**
- [ ] **T9.1.3** AI 选段操作 → Notice 报 `AI failed: ...`
- [ ] **T9.1.4** 恢复网络 / URL，所有功能立即恢复

### 9.2 索引文件损坏

- [ ] **T9.2.1** 关闭 Obsidian
- [ ] **T9.2.2** 编辑 `<vault>/.obsidian/plugins/aether-note-llm/data.json` → 把 `index.json` 字段值改成 `"{not json"`
- [ ] **T9.2.3** 重启 Obsidian
- [ ] **T9.2.4** 出现 Notice `Index corrupt; please rebuild from settings`
- [ ] **T9.2.5** `Settings → Rebuild` → 恢复成功

### 9.3 设置文件损坏

- [ ] **T9.3.1** 关闭 Obsidian
- [ ] **T9.3.2** 把 `data.json` 里 `settings.json` 字段值改成 `"{not json"`
- [ ] **T9.3.3** 重启 Obsidian
- [ ] **T9.3.4** 设置加载**不崩溃**，恢复成默认（Providers 为空）
- [ ] **T9.3.5** `data.json` 应该出现 `settings.json.bak.<timestamp>` 字段（备份原值）

---

## 阶段 10：性能 / 极限

### 10.1 中等量

- [ ] **T10.1.1** 准备 50-100 篇随机笔记内容（可以拿一本书每章拆一段）
- [ ] **T10.1.2** 分 5-10 批 Import
- [ ] **T10.1.3** 全部 approve（用"全选 → 接受"如有；v0.1 没有，得一张张点）
- [ ] **T10.1.4** 重建索引 → 应在 1-3 分钟内完成（取决于 embedding API 延迟）
- [ ] **T10.1.5** 搜索响应时间感觉 < 1s

### 10.2 单批大量

- [ ] **T10.2.1** 一次粘贴一份**真实 Chrome Bookmarks**（实际可能 500+ 条）
- [ ] **T10.2.2** Aether 不卡顿、不崩溃
- [ ] **T10.2.3** 单批超过 200 条时**停止处理** —— 看 toast / Inbox 数（v0.1 是硬截断）

### 10.3 token 用量

- [ ] **T10.3.1** 跑完阶段 3-6 后看 Diagnostics export → `usage.monthTotal`
- [ ] **T10.3.2** prompt + completion 在数千到几万 tokens 范围（具体看导入量）

---

## 回归测试模板（每次发布前用）

完整跑 0、1、2 关键步骤、3.1、4、5.1、6、7、8、9.1。约 20 分钟。

如果任意一项失败 → **阻塞发布**，去查 commit、写 issue、修。

---

## Bug 报告模板

发现问题时，在 issue 里贴这个：

````markdown
**版本**：Aether Note LLM v[X.Y.Z]（看 manifest.json）
**Obsidian 版本**：[在 Settings → About 看]
**系统**：[macOS / Windows / Linux + 版本]

**复现步骤**：

1. ...
2. ...
3. ...

**期望行为**：...
**实际行为**：...

**Diagnostics 报告**（`⌘P → Aether: Diagnostics export → Copy`）：

```json
{ ... 这里粘贴脱敏后的 JSON ... }
```

**控制台日志**（`⌘⌥I` → Console 标签，截图或粘贴红字部分）：

```
...
```
````

---

## 自检：本文档自己也要保持有效

下次发布前，本人按这份跑完一遍之后 —— 如果发现某个步骤**写错了 / 漏了 / 多余了**，**当场改这份文档**。否则跑完一次它的"准确度"就掉了。
