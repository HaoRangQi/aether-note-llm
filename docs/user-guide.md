# 日常使用指南

> **目标读者**：已经把插件装到 Obsidian 里，并准备开始导入、检索、维护个人经验资产的用户。
>
> 还没装？先看 [启动与接入指南](contributing/getting-started.md)。

---

## 场景一：第一次启动，从零导入第一批资料

**目标**：把一小批散落笔记 / 文章 / 书签放进 vault，并确认未来能搜回来。

1. 打开 Hub：`⌘P → Open Aether Hub`，或点左侧 ribbon 的小机器人 Aether Hub 图标。
2. 如果 Hub 顶部显示 `需要配置` 或 `部分可用`，先查看健康卡片里的缺项，点按钮进入 `Settings → Aether Note LLM → Quick Start`。
3. 添加 Provider，测试连接，再在 Quick Start 里绑定：
   - chat 类角色：`summarize` / `rewrite` / `extract` / `critique` / `answer` / `inbox_metadata`
   - embedding 角色：用于语义搜索
4. 如果 vault 里包含私密文件、密钥或密码，优先选择本地模型或可信自部署服务；AI Providers 页面和新建 Provider 卡片会直接提示这条风险。
5. 回到 Hub，点 `Import`。
6. 第一次只粘贴一段短文本，确认导入能完成。
7. 解析完成后，会出现预览清单；可直接编辑标题、摘要、标签，并勾选要写入的条目。若检测到可能重复，预览清单会显示相似目标笔记，可选择合并、新建或丢弃。
8. 点击写入所选项后，会出现结果清单；可逐条打开生成文件或被合并的目标文件，也可以查看失败明细或撤销本次新建内容。若写入失败项被保留为待处理，可从结果页、Hub 的 `待处理` 按钮或命令面板 `Aether: 处理待导入项` 重新打开预览流继续处理。
9. 文件会写入 `Aether Inbox/notes/<yyyy>/<mm>/...md`，Hub 的“最近”区域会显示它。

> 当前版本走“先预览，再写入”。AI 生成的标题 / 标签 / 摘要会先出现在预览清单，写入前可直接编辑；只有勾选并确认的条目才会写进 vault。不满意时可取消整批、取消勾选单条、在结果清单里撤销本次新建内容，或直接打开生成的 markdown 手动调整。可能重复的条目默认合并到检测到的目标笔记，也可以改成新建或丢弃；已合并内容不会被结果页的撤销按钮自动回滚，需要在目标笔记中手动回退。若部分条目失败，结果清单会显示对应来源和错误原因，已成功写入或合并的条目不受影响。解析失败项不会进入待处理列表，需要修正来源后重新导入；写入失败项会保留为 `pending`，可从 Hub 或命令面板继续处理。

---

## 场景二：日常吸纳新信息

**目标**：看到有价值的材料时，用最少步骤存入 Aether。

| 来源                  | 操作                                                                  |
| --------------------- | --------------------------------------------------------------------- |
| 网页文章 / 微信公众号 | 复制正文 → Hub → `Import` → 粘贴 → `Import` → 预览后写入所选          |
| 一段闪念              | 直接写在 Obsidian，或粘贴到 Aether Import                             |
| Markdown 文件         | Hub → `Import` → File tab → 选择 `.md` / `.markdown` → 预览后写入所选 |
| Chrome 书签           | 导出 Chrome Bookmarks JSON，或选择 Bookmarks 文件内容导入             |
| iTab 数据             | 选择 `.itabdata` 或对应 JSON 文件导入                                 |
| URL 列表              | 一行一个完整 `http(s)` URL，粘贴导入或选择 `.txt` / `.url` 文件       |

建议第一次只导 5-10 条。确认标题、标签、摘要质量可接受后，再批量导入更多内容。

---

## 场景三：检索过往经验

**目标**：用一句自然语言找回过去写过、存过或收藏过的东西。

1. 打开 Hub。
2. 在搜索框输入问题或关键词。
3. 用过滤按钮切换 `全部` / `笔记` / `书签`。
4. 查看命中卡片的标题、摘要和命中片段。
5. 有结果时可点 `综合回答`，Aether 会基于当前展示的命中片段生成带 `[1]`、`[2]` 引用的回答。
6. 展开回答下方的来源，可查看证据片段、路径、标题层级和 URL；也可以一键复制回答和来源。
7. 点击来源里的打开按钮或结果卡片：笔记会打开 Obsidian 文件，书签会打开原 URL。

搜索优先走 BM25 + embedding 混合检索。Hub 顶部会显示配置健康状态：`Ready` 表示导入元数据、编辑器 AI 和语义搜索配置完整；`需要配置` 表示存在会阻断 AI 功能的缺项；`部分可用` 多用于 embedding 缺失等可降级场景。搜索结果上方会显示当前模式：`Hybrid`、`BM25` 或 `Stale-biased`。若 embedding 没配置、API key 缺失或 Provider 临时失败，Aether 会自动降级到 BM25 文本搜索，并显示降级原因；搜索框仍可用。综合回答使用当前已展示的搜索结果作为上下文，不会另起一轮搜索；回答下方会显示本次使用的上下文 token 估算，长上下文被截断时会提示。每条来源都可展开核对证据片段，并能复制回答 + 来源用于复盘或分享。若回答没有引用来源，或引用了不存在的编号，Hub 会显示人工核对提示。切换 embedding 模型导致维度不匹配时，需要在 Settings 里执行 `Rebuild index`。

---

## 场景四：从书签快速跳转

**目标**：把过去收藏的网页当成知识资产一起搜索。

1. 导入 Chrome 书签 JSON 或 iTab 数据。
2. 在 Hub 里搜索标题、域名、主题词。
3. 过滤到 `书签` 可只看 bookmark 结果。
4. 点击命中卡片，Aether 会用默认浏览器打开原 URL。

书签仍会以 markdown 文件形式存入 vault，frontmatter 中包含 `aether_kind: bookmark` 和 `aether_url`。

---

## 场景五：写笔记时让 AI 帮忙

**目标**：在 Obsidian 编辑器里对选中文本做轻量处理，而不是进入完整聊天工作台。

1. 在任意笔记中选中一段文字。
2. 右键菜单会显示启用且 `showInEditor = true` 的 AI Role。
3. 点击对应角色，例如总结、改写、提取要点或自定义角色。
4. Modal 展示原文和 AI 输出。
5. 满意则 `Replace selection`，不满意则取消。

AI Role 可以在 `Settings → Aether Note LLM → AI Roles` 里编辑 Provider、模型、提示词、参数和是否显示在右键菜单。提示词编辑区会显示模板使用了哪些 `{{variable}}`、哪些变量可用但未使用，以及是否引用了当前角色不会提供的变量；存在缺失变量时，Role 运行会直接失败并提示变量名，避免发送残缺 prompt。

---

## 场景六：长期使用 / 索引维护

**目标**：保证搜索质量稳定，并控制 token 成本。

### 何时重建索引

| 信号                              | 推荐操作                                                         |
| --------------------------------- | ---------------------------------------------------------------- |
| 切换 embedding Provider 或模型    | 必须 `Rebuild index`                                             |
| 搜索提示维度不匹配                | 必须 `Rebuild index`                                             |
| 少量手工修改或删除已索引 markdown | 优先 `Refresh index changes`                                     |
| 大量手工新增 / 修改 markdown      | 建议 `Rebuild index`                                             |
| 只是 chat 模型变化                | 不需要重建                                                       |
| Hub 显示 `BM25`                   | 可继续文本搜索；按提示检查 embedding Role、Provider 或 API key   |
| Hub 显示 `Stale-biased`           | 有部分索引陈旧，可继续搜索；空闲时先执行 `Refresh index changes` |
| embedding 暂时不可用              | 可继续 BM25 搜索，之后再恢复配置                                 |

`Refresh index changes` 会检测当前扫描范围内已索引文件的内容变化或删除，只刷新变更项并移除已删除文件的旧索引。它适合日常维护，速度通常比完整重建更快。`Rebuild index` 会重新扫描当前设置的范围：整个 vault，或仅 `Aether Inbox/`，并重新切片 / 生成向量；切换 embedding 模型、索引损坏或大量新增文件时仍应使用完整重建。大 vault 下建议先用测试 vault 验证 Provider 和预算。

导入写入、刷新索引变更和重建索引都会显示统一任务进度。重建时会依次显示扫描、索引和保存阶段；导入确认写入时会显示当前写入条数。任务进度上的 `Cancel` 会在当前安全步骤完成后停止后续处理：导入会保留已写入条目并丢弃剩余待导入条目，重建会保存当前部分索引。取消会显示为 cancelled，不会当作失败状态；从 Settings、Hub 或重建提示触发的按钮会恢复可点。若重建只有部分文件失败，完成提示会显示失败数量，控制台会记录失败文件路径和原因。

Hub 里的 `最近任务` 会显示最近导入写入、刷新索引变更和重建任务的完成 / 失败 / 取消状态、耗时、数量摘要和失败明细。排查问题时可先看这里；需要提交 issue 或做深入排查时，再复制 Diagnostics JSON。

### 成本控制

- embedding 保持质量优先，因为它直接影响语义召回。
- `summarize` / `rewrite` / `extract` / `critique` / `inbox_metadata` 可以用更便宜的 chat 模型。
- `View this month's usage` 会打开本月用量面板，显示总 token、prompt / completion 拆分、按功能拆分和月度预算进度。
- `Settings → Advanced → Monthly token budget warning` 可设置月度 token 提醒阈值；首次跨过阈值时会主动提示，留空表示不提醒。
- `View recent jobs` 会打开最近任务面板，适合快速查看导入 / 刷新 / 重建失败原因。
- `Diagnostics export` 会导出脱敏诊断信息，可用于排查索引数量、最近导入 / 刷新 / 重建任务、失败摘要、配置和 token 用量。

---

## 场景七：换设备 / 备份

**目标**：在新设备上恢复笔记和索引能力。

| 同步方式                | Aether 行为                                                |
| ----------------------- | ---------------------------------------------------------- |
| iCloud Drive / OneDrive | 同步 markdown；如果同步 `.obsidian/plugins/`，设置也会同步 |
| Obsidian Sync           | 需要允许同步 `.obsidian/plugins/` 才会带上插件数据         |
| Syncthing / Resilio     | 同步整个 vault 即可                                        |
| Git                     | 不建议把明文 API key 推到公开仓库；提交前检查 `data.json`  |

新设备上如果索引文件缺失，执行一次 `Settings → Aether Note LLM → Advanced → Rebuild index` 即可重建。API key 属于敏感信息，跨设备时建议重新粘贴或确认同步范围。

---

## 9 个最容易踩的坑

| #   | 现象                                | 原因                                 | 解决                                                                                                         |
| --- | ----------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| 1   | 启用插件后 Hub 没出现               | core 或 plugin 没 build              | `pnpm --filter @aether/core build && pnpm --filter aether-note-llm build`                                    |
| 2   | Test connection 报 `HTTP 404`       | Base URL 写到了 `/chat/completions`  | 改成只到 `/v1`                                                                                               |
| 3   | Test connection 报 `HTTP 401`       | API key 错或有多余空格               | 重输 key                                                                                                     |
| 4   | 搜索只有字面匹配                    | embedding 未配置或 Provider 不可用   | 配置 embedding Role；期间可继续 BM25 搜索                                                                    |
| 5   | 切换 embedding 后搜索提示维度不匹配 | 旧向量维度和新模型不一致             | `Settings → Aether Note LLM → Advanced → Rebuild index`                                                      |
| 6   | 导入标题 / 标签质量差               | `inbox_metadata` 角色模型能力不足    | 换更强 chat 模型或编辑 Role 提示词                                                                           |
| 7   | 批量导入耗时长                      | metadata 和 embedding 都需要远程调用 | 小批量导入，先验证质量和预算                                                                                 |
| 8   | 导入后发现内容不该入库              | 预览时误选，或写入后才发现不需要     | 对新建笔记可在导入结果清单里点“撤销本次导入”；对合并内容需要打开目标笔记手动回退；下次可在预览清单选择丢弃   |
| 9   | 批量导入只有部分成功                | 个别条目解析、AI metadata 或写入失败 | 在导入结果清单查看失败来源和错误原因；解析失败需修正来源后重导，写入失败可从 Hub `待处理` 或命令面板继续处理 |

---

## 推荐节奏

**每天**：看到可复用经验就导入；遇到写不清的段落就用右键 AI Role。

**每周**：检查 `Aether Inbox/` 最近文件，修正标题、标签、摘要质量不好的条目。

**每月**：看一次最近任务和 Diagnostics；如只是少量手动修改，跑一次刷新变更；如换过 embedding 模型或大量改动 vault，跑一次重建。

---

## 下一步阅读

- [架构总览](architecture/overview.md)
- [数据格式](architecture/data-formats.md)
- [UAT 验收清单](testing/uat-checklist.md)
- [开发规范](contributing/coding-standards.md)
