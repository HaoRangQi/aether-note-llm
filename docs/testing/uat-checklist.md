# UAT 验收测试清单

> **用途**：每次发布前、接手新环境或怀疑功能退化时，按这份清单确认当前 v0.3 用户路径仍可用。
>
> 这份是人工验收清单，不是 CI 自动测试。完整跑完约 30-60 分钟。

---

## 最近执行记录

| 日期       | 范围                        | 环境 / 分支 | 结论                                                                                                     |
| ---------- | --------------------------- | ----------- | -------------------------------------------------------------------------------------------------------- |
| 2026-05-25 | 自动化回归 + 提交前文档治理 | `main`      | PASS：`pnpm test` 388 tests、`pnpm typecheck`、`pnpm --filter aether-note-llm build`、`git diff --check` |
| 2026-05-25 | 手工 Obsidian UAT           | `main`      | 待执行：提交前至少复核阶段 1、2、3.1、4、7 的用户可见路径                                                |

---

## 测试准备

- [ ] 干净的 Obsidian vault，建议命名为 `Aether QA`
- [ ] Node >= 20、pnpm >= 11
- [ ] 至少 1 个 OpenAI 兼容 chat Provider key
- [ ] 推荐再准备 1 个 embedding Provider key，例如 SiliconFlow + `BAAI/bge-m3`
- [ ] 准备短文本、长文本、Markdown 文件、Chrome Bookmarks JSON、iTab 数据或 URL 列表

---

## 阶段 0：自动化冒烟

- [ ] **T0.1** `pnpm install` 成功
- [ ] **T0.2** `pnpm --filter @aether/core build` 成功
- [ ] **T0.3** `pnpm typecheck` 全绿
- [ ] **T0.4** `pnpm test` 全绿，当前应为 388 tests（core 247 + plugin 141）
- [ ] **T0.5** `pnpm --filter @aether/core test:coverage` 达到阈值
- [ ] **T0.6** `pnpm --filter @aether/core smoke` 输出 `=== 冒烟测试全部通过 ✓ ===`
- [ ] **T0.7** `pnpm --filter aether-note-llm build` 产出 `packages/plugin/main.js`

任一步失败都先排查，不进入 Obsidian 手测。

---

## 阶段 1：安装与启用

- [ ] **T1.1** 软链插件三件套到 `<vault>/.obsidian/plugins/aether-note-llm/`
- [ ] **T1.2** Obsidian 打开 QA vault，关闭 Restricted mode
- [ ] **T1.3** 启用 Aether Note LLM，无控制台红字
- [ ] **T1.4** 左侧 ribbon 出现小机器人助手风格的 Aether Hub 图标（非通用 search / layers 图标），悬停显示 `Aether Hub`
- [ ] **T1.5** 首次启用后自动打开 Hub；关闭 Hub 后重启 Obsidian 不会再次强制打开
- [ ] **T1.6** 状态栏显示已索引数量和 Provider 数量
- [ ] **T1.7** `⌘P` 打开命令面板；英文界面能看到 Open Aether Hub、Import...、Review pending imports、Refresh index changes、Rebuild index、View recent jobs、View this month's usage、Diagnostics export；中文界面能看到打开 Aether Hub、导入...、处理待导入项、刷新索引变更、重建索引、查看最近任务、查看本月用量、导出诊断信息

---

## 阶段 2：Quick Start 与 Provider

- [ ] **T2.1** Settings → Aether Note LLM，看到 Quick Start / AI Providers / AI Roles / Advanced 四段；中文界面对应为 快速开始 / AI 服务商 / AI 角色 / 高级
- [ ] **T2.2** Quick Start 中添加预设 Provider
- [ ] **T2.3** AI Providers 中填写 API key 并 Test 成功
- [ ] **T2.3a** AI Providers 中点击服务商申请 Key 链接；若浏览器拦截或 URL 无效，会显示失败提示，不影响当前 Provider 表单内容
- [ ] **T2.3b** AI Providers 中服务商卡片左侧有明确展开 / 收起图标；点击「添加服务商」或从 Quick Start 添加预设后，新服务商卡片自动展开到可填写状态
- [ ] **T2.3c** AI Providers 区块顶部和新建服务商展开表单中都显示风险提示：私密文件、密钥或密码应优先使用本地模型或可信自部署服务，避免发送给第三方模型
- [ ] **T2.3d** 每个 Provider 卡片都可设置「可信赖的供应商，可访问私密文件」开关；开启后可用于私密角色，关闭后仅可用于公开角色
- [ ] **T2.4** 故意填错 key，Test 显示明确失败信息；恢复正确 key
- [ ] **T2.5** Quick Start 中选择 chat Provider 和 embedding Provider
- [ ] **T2.6** 点应用绑定，AI Roles 中 `summarize` / `rewrite` / `extract` / `critique` / `answer` / `inbox_metadata` / `embedding` 已绑定 Provider / Model
- [ ] **T2.6a** 若模型列表同时包含 chat 与 embedding 模型，Quick Start 会给聊天类角色选择 chat 模型，给 `embedding` 选择 embedding 模型
- [ ] **T2.7** 新建一个自定义 AI Role，设置 `showInEditor = true`
- [ ] **T2.8** Advanced 中能看到 Inbox folder、Scan scope、Search weight α、Monthly token budget warning、Refresh index changes、Rebuild index；中文界面对应为 Inbox 文件夹、扫描范围、搜索权重 α；若设置数据中 search weight α 为 NaN / Infinity / 越界值，迁移层会归一化到 `0..1` 或默认 `0.4`
- [ ] **T2.8a** 若旧设置中的 AI Role provider 参数包含 `temperature = NaN / Infinity / > 2` 或无效 `maxTokens`，迁移层会在运行 Role 前删除、回落到内置安全默认值或取整这些参数，同时保留自定义 prompt 变量参数
- [ ] **T2.8b** Advanced 中可配置隐私路由：私密目录列表、私密导入目录；AI Roles 中每个角色可分别配置公开模型与私密模型
- [ ] **T2.9** 无 Provider 或缺 API key / model 时，Hub 顶部显示 `需要配置`，健康卡片列出具体缺项并可打开 Settings
- [ ] **T2.10** 仅清空 embedding Role Provider 时，Hub 顶部显示 `部分可用`，健康卡片提示 embedding 缺项，搜索仍可降级到 BM25
- [ ] **T2.11** 自定义 Provider 的 Base URL 为空或不是 `http(s)` URL 时，Hub 健康卡片显示 Base URL 缺失 / 无效

---

## 阶段 3：Hub 与导入

### 3.1 粘贴文本

- [ ] **T3.1.1** Hub → `Import` → 粘贴短文本 → `Import`
- [ ] **T3.1.1a** 导入弹窗默认目标为私密导入（首次）；后续默认记忆上次选择
- [ ] **T3.1.1b** 从私密切到公开导入时，必须出现风险确认；取消确认后保持私密导入
- [ ] **T3.1.2** 进度提示显示解析状态，解析完成后弹出预览清单
- [ ] **T3.1.2a** 预览清单显示标题、来源、摘要、标签，并可编辑标题 / 摘要 / 标签、全选 / 全不选 / 单条勾选
- [ ] **T3.1.2b** 取消并丢弃后不写入 vault，Diagnostics 中 pending inbox 不增加
- [ ] **T3.1.3** 点击写入所选后弹出结果清单，显示成功条数和生成文件路径
- [ ] **T3.1.3b** 写入所选时显示统一任务进度，完成后自动关闭进度提示
- [ ] **T3.1.3c** 写入过程中点击任务进度的 Cancel，后续未写入条目被丢弃，结果清单只显示已写入条目
- [ ] **T3.1.3a** 如果部分条目写入失败，结果清单显示失败来源和错误原因，已成功条目仍可打开，且可点击处理待导入失败项重新打开预览流
- [ ] **T3.1.3d** Hub 快捷操作显示待处理数量；有 pending import 时可从 Hub 或命令面板重新打开，关闭该历史 pending 预览不会自动丢弃条目
- [ ] **T3.1.3e** 从待处理入口只写入部分 pending import 时，未选条目仍保持 pending，可再次从待处理入口继续处理
- [ ] **T3.1.3f** 从待处理入口写入时点击任务进度 Cancel，已写入条目保持完成，剩余未处理条目仍为 pending，最近任务记录为 cancelled
- [ ] **T3.1.4** vault 出现 `Aether Inbox/notes/<yyyy>/<mm>/...md`
- [ ] **T3.1.4a** 公开导入写入 `Aether Inbox/...`；私密导入写入 `Aether Private Inbox/...`
- [ ] **T3.1.5** 生成文件 frontmatter 包含 `aether_id`、`aether_kind`、`title`、`tags`、`aether_summary`
- [ ] **T3.1.5a** 在预览清单修改标题、摘要、标签后写入，生成文件 frontmatter 和搜索结果使用修改后的 metadata
- [ ] **T3.1.6** Hub 最近列表显示新导入文件，点击能打开笔记
- [ ] **T3.1.7** 结果清单中点击 `Open` 可打开对应笔记
- [ ] **T3.1.7a** 结果清单中点击 `Open` 打开失败时显示失败提示，结果清单和已写入 / 已合并路径仍保留可见
- [ ] **T3.1.8** 再导入一条测试内容，点击 `Undo this import` 后文件从 vault 消失，搜索不再命中
- [ ] **T3.1.9** 再导入相似内容时，预览清单显示可能重复目标，并可在合并 / 新建 / 丢弃之间切换
- [ ] **T3.1.10** 选择合并后，结果清单显示已合并目标；点击 `Open` 打开原笔记，搜索能命中新合并内容
- [ ] **T3.1.11** 同一批中同时存在新建和合并时，`Undo this import` 只删除本次新建笔记，不删除已合并目标笔记

### 3.2 文件导入

- [ ] **T3.2.1** Import → File tab 可选择 `.md` / `.markdown` / `.txt` / `.url` / `.json` / `.itabdata`
- [ ] **T3.2.2** Chrome Bookmarks JSON 可导入多条 bookmark
- [ ] **T3.2.3** iTab 数据可导入 bookmark
- [ ] **T3.2.3a** 多条 bookmark 可在预览清单中选择性写入，未勾选条目不会生成 markdown
- [ ] **T3.2.4** bookmark 文件落在 `Aether Inbox/bookmarks/<yyyy>/<mm>/`
- [ ] **T3.2.5** bookmark frontmatter 包含 `aether_kind: bookmark` 和 `aether_url`
- [ ] **T3.2.6** Markdown `.md` / `.markdown` 文件可从 File tab 导入，预览清单显示文件标题和正文
- [ ] **T3.2.7** `.txt` / `.url` URL 列表文件可从 File tab 导入，完整 `http(s)` URL 进入预览，普通文本行会被跳过

### 3.3 目录导入（后台）

- [ ] **T3.3.1** Import → `导入目录` tab 可见，并可选择目录
- [ ] **T3.3.2** 目录导入仅处理 `.md` / `.markdown`，其他文件类型会被过滤
- [ ] **T3.3.3** 目录里没有可导入 Markdown 时，提示空目录，不启动后台任务
- [ ] **T3.3.4** 目录导入启动后，顶部任务提示显示读取/写入进度，且可取消
- [ ] **T3.3.5** 目录导入运行时启动其他 AI / 导入 / 索引任务，活动提示并存堆叠，不会顶掉目录导入进度
- [ ] **T3.3.6** 目录导入完成/失败/取消后，`最近任务` 记录状态、数量摘要与失败明细
- [ ] **T3.3.7** 目录导入写入失败项会保留为 pending，可从待处理入口继续处理

### 3.4 异常输入

- [ ] **T3.4.1** 空文本导入会提示，不写入文件
- [ ] **T3.4.2** 不支持的文件类型会提示，不崩溃
- [ ] **T3.4.3** 单批超过 200 条时不崩溃，并能看到实际导入条数
- [ ] **T3.4.4** URL 列表中的无协议文本、普通文本和 `mailto:` 会被跳过；仅完整 `http(s)` URL 进入预览
- [ ] **T3.4.5** 解析失败项会在预览 / 结果中提示未保留为 pending，需要修正来源后重新导入
- [ ] **T3.4.6** 粘贴多行完整 `http(s)` URL 时进入多条 bookmark 预览，而不是生成单条普通 note

---

## 阶段 4：搜索

- [ ] **T4.1** Hub 搜索框输入已导入内容的关键词，300ms 左右出现结果
- [ ] **T4.1a** Hub 搜索框下方显示隐私提示：私密笔记、密钥或密码应优先使用本地模型，避免发送给第三方模型
- [ ] **T4.2** 结果卡片显示标题、摘要、命中片段、kind 和路径
- [ ] **T4.3** 点击 note 结果打开 Obsidian 文件
- [ ] **T4.3a** note 搜索结果或 Hub 最近导入卡片打开失败时显示失败提示，当前结果 / 最近列表仍保留可见
- [ ] **T4.4** 点击 bookmark 结果打开默认浏览器 URL
- [ ] **T4.5** `全部` / `笔记` / `书签` 过滤有效
- [ ] **T4.5a** Hub `公开 / 私密 / 全部` 范围切换有效：`公开` 不显示私密目录命中，`私密` 不显示公开目录命中
- [ ] **T4.6** 搜索不存在的字符串，显示空结果，不崩溃
- [ ] **T4.7** 搜索结果上方显示当前模式：`Hybrid`、`BM25` 或 `Stale-biased`
- [ ] **T4.8** 有搜索结果时点击 `综合回答`，生成基于当前结果的回答，并显示 `[1]` 等引用入口
- [ ] **T4.8a** Provider 返回空回答或仅包含空白字符的回答时显示空状态，不显示 `复制回答 + 来源` 或来源打开按钮
- [ ] **T4.9** 展开综合回答来源，可看到证据片段、路径、标题层级；点击来源打开按钮时，note 来源在 Obsidian 中打开对应文件，bookmark 来源打开原始 URL
- [ ] **T4.9a** note 或 bookmark 来源打开失败时显示失败提示，回答正文、上下文 token 状态和来源证据仍保留
- [ ] **T4.10** 回答下方显示本次使用的上下文 token 估算；长上下文被截断时显示预算截断提示，截断来源也显示片段截断提示
- [ ] **T4.11** 如果回答正文没有任何来源编号，或引用了不存在的编号（如 `[3]` 但来源列表没有 `[3]`），回答下方显示需要人工核对的风险提示
- [ ] **T4.12** 点击 `复制回答 + 来源` 后，剪贴板包含回答正文、来源编号、路径、标题层级、URL 和证据片段，且页面中的回答和来源仍保留可见
- [ ] **T4.12a** 若系统拒绝剪贴板写入，`复制回答 + 来源` 显示复制失败提示，不清空回答正文、上下文 token 状态或来源列表
- [ ] **T4.13** 取消或清空 `answer` Role 绑定后点击 `综合回答`，显示配置提示，不影响基础搜索结果，也不显示 `复制回答 + 来源` 或来源打开按钮
- [ ] **T4.13a** `answer` Role 的 Provider 调用失败时显示失败原因，按钮恢复为 `综合回答`，不显示 `复制回答 + 来源` 或来源打开按钮
- [ ] **T4.14** `综合回答` 运行中点击 Cancel，回答区域显示已取消，按钮恢复为 `综合回答`，不显示失败样式；若底层 Provider 在取消后才返回结果，不渲染过期回答
- [ ] **T4.15** 私密范围未配置私密路由且没有 trusted 回退时：搜索可降级 BM25，综合回答阻断并给出可配置提示，私密正文不应外发给第三方模型

### 4.1 BM25 降级

- [ ] **T4.1.1** 取消或清空 embedding Role 的 Provider 绑定
- [ ] **T4.1.2** 回到 Hub 搜索明确存在的关键词
- [ ] **T4.1.3** 搜索仍返回文本命中结果，不弹 `BINDING_NOT_FOUND`
- [ ] **T4.1.4** 结果上方显示 `BM25`，并说明 embedding Role / API key / Provider 的降级原因
- [ ] **T4.1.5** 恢复 embedding Role 后，搜索恢复 `Hybrid`

### 4.2 维度不匹配

- [ ] **T4.2.1** 切换 embedding 模型到不同向量维度的模型
- [ ] **T4.2.2** 搜索出现重建索引提示
- [ ] **T4.2.3** 点击提示里的 rebuild 按钮后，显示统一任务进度；重建完成并恢复搜索

---

## 阶段 5：编辑器 AI Role

- [ ] **T5.1** 打开任意笔记并选中 50-200 字
- [ ] **T5.2** 右键菜单显示启用且 `showInEditor = true` 的 AI Role
- [ ] **T5.3** summarize / rewrite / extract 输出不为空
- [ ] **T5.4** 自定义 AI Role 出现在右键菜单并可运行
- [ ] **T5.5** AI Role 编辑器中模型列表未缓存时，可在当前弹窗点击刷新模型列表并选择模型
- [ ] **T5.6** 命令面板运行 `Run current AI role…` 打开实时 AI Role 选择器；新建、启用或取消隐藏的 Role 无需重启即可出现，输入关键词时按最新角色名称 / 描述过滤；选择 Role 后调用 Provider 并打开结果 Modal
- [ ] **T5.6a** 已注册的 AI Role 命令在对应 Role 被停用、隐藏或解绑后运行，只提示角色不可用，不调用 Provider，也不打开结果 Modal；若 `Run current AI role…` 的选择器已打开后该 Role 被停用、隐藏或解绑，选择旧条目同样只提示不可用，不调用 Provider
- [ ] **T5.7** AI Role 编辑器提示词区域显示已使用变量、可用但未使用变量；模板引用不存在变量时显示缺失变量警告
- [ ] **T5.8** 通过命令或自定义 Role 运行时，即使运行时覆盖参数里包含 `temperature = NaN / Infinity / > 2` 或无效 `maxTokens`，发往 Provider 前也会回落到安全默认值、删除无效 token 上限或取整合法 token 上限
- [ ] **T5.8** 模板存在缺失变量时运行 Role，会在调用 Provider 前失败并提示变量名
- [ ] **T5.9** Modal 中 `Replace selection` 可替换选区并关闭 Modal，`Discard` 只关闭 Modal 且不替换选区，`⌘Z` 可撤销已替换内容
- [ ] **T5.9a** Modal 中 `Copy` 只复制 AI 输出，不包含原文；若系统拒绝剪贴板写入，显示复制失败提示，Modal 不关闭，原文和 AI 输出仍可见
- [ ] **T5.10** 未选中文本时运行已注册 Role 命令或 `Run current AI role…`，提示先选择文本，不调用 Provider，不打开 Role 选择器，也不打开结果 Modal
- [ ] **T5.11** 运行中取消，显示取消提示，不替换文本，活动提示不显示为错误态；若 Provider 迟到返回结果，不打开结果 Modal；重复点击 Cancel 不会触发重复取消回调

---

## 阶段 6：持久化 / 重启

- [ ] **T6.1** 当前已有导入文件、Provider 配置和自定义 Role
- [ ] **T6.2** 关闭并重启 Obsidian
- [ ] **T6.3** Hub 能打开，最近文件仍显示
- [ ] **T6.4** 搜索之前用过的关键词仍命中
- [ ] **T6.5** AI Providers / AI Roles / Advanced 设置保留
- [ ] **T6.6** API key 按预期保留或按同步策略重新填写

---

## 阶段 7：重建与诊断

- [ ] **T7.1** Settings → Refresh index changes 成功，Hub → `刷新变更` 也可触发同一任务
- [ ] **T7.1a** 修改一篇已索引 markdown 后执行 Refresh index changes，搜索能命中新内容，旧正文片段不再出现在结果片段中
- [ ] **T7.1b** 删除一篇已索引 markdown 后执行 Refresh index changes，搜索不再命中该文件，任务历史显示 removed 数量
- [ ] **T7.1c** Refresh index changes 运行中点击 Cancel，任务提示显示已取消，活动提示不显示为错误态，最近任务状态为 cancelled 而不是 failed，Settings / Hub 触发按钮恢复可点
- [ ] **T7.1d** 重建或刷新任务运行中再次从 Settings / Hub 触发刷新，会提示已有索引任务运行中，刚点击的按钮恢复可点
- [ ] **T7.1e** 刷新索引核心任务已成功但后续 Hub / Settings UI 刷新失败时，仅显示界面刷新失败提示，最近任务仍记录为 done，不改成 failed
- [ ] **T7.1f** Refresh index changes 部分文件刷新失败时，完成提示显示失败数量，最近任务状态为 failed 并保留失败路径 / 原因，同时仍执行 Hub / Settings 后续 UI 刷新
- [ ] **T7.1g** Refresh index changes 遇到非取消错误时显示失败提示，最近任务状态为 failed 并保留错误摘要，不调用取消或完成后的 UI 刷新路径
- [ ] **T7.2** Settings → Aether Note LLM → Advanced → Rebuild index 成功
- [ ] **T7.3** 重建过程显示扫描 / 索引 / 保存进度，完成后显示 scanned / indexed 数量
- [ ] **T7.3a** 若部分文件重建失败，完成提示显示失败数量，控制台能看到失败文件路径和原因
- [ ] **T7.3a.1** Rebuild index 遇到非取消错误时显示失败提示，最近任务状态为 failed 并保留错误摘要，不调用取消或完成后的 UI 刷新路径
- [ ] **T7.3b** 重建过程中点击任务进度的 Cancel，若核心返回 cancelled 结果或抛出 ABORTED，活动提示都不显示为错误态，最近任务状态为 cancelled 且记录 scanned / indexed 数量（异常中断时为 0/0），Settings / Hub / rebuild prompt 触发按钮恢复可点
- [ ] **T7.3b.1** 长任务进度文案会随阶段更新并保留已运行时间；启动新的 AI / 导入 / 索引活动时，活动提示会并存堆叠，旧任务进度不丢
- [ ] **T7.3c** 刷新或重建任务运行中再次从 Settings / Hub / rebuild prompt 触发重建，会提示已有索引任务运行中，刚点击的按钮恢复可点
- [ ] **T7.3d** 重建核心任务已成功但后续 Hub / Settings / rebuild prompt UI 刷新失败时，仅显示界面刷新失败提示，最近任务仍记录为 done；若只有部分文件失败，最近任务记录为 failed 并保留失败路径 / 原因
- [ ] **T7.4** 重建后搜索能命中 Aether 创建的文件
- [ ] **T7.5** scan scope 改为 `Aether Inbox only` 后，刷新变更和重建范围只覆盖导入目录
- [ ] **T7.6** `⌘P → Diagnostics export`（中文界面：`导出诊断信息`）打开 JSON modal
- [ ] **T7.7** `pluginVersion` = `0.3.0`
- [ ] **T7.8** `settings.apiKeys.*`、Provider `defaultHeaders` 中的 Authorization / API key、失败文本里的 `Authorization: ...` / `Proxy-Authorization: ...` / `Cookie: ...` / `Set-Cookie: ...` / `proxy-authorization=...` / `cookie=...` / `set-cookie=...`、Base URL userinfo（如 `https://user:pass@host`）、Base URL query / fragment / hash-route 中的 key / token / access-token / refresh-token / id-token / client-secret / 自定义 `*token` / `*secret` 参数，以及失败文本里的 `X-Api-Key: ...` / `access-token: ...` / `refresh-token: ...` / `id-token: ...` / `client-secret: ...` / `auth-token: ...` 已脱敏
- [ ] **T7.9** Copy to clipboard 可复制诊断 JSON，剪贴板内容包含 `pluginVersion`、`recentJobs` 和 `usage`
- [ ] **T7.9a** 诊断 JSON 复制失败时显示复制失败提示，modal 不关闭，JSON 内容仍留在 modal 中可手动选取
- [ ] **T7.9b** 最近任务读取失败时 Diagnostics export 仍打开并可复制，JSON 中 `recentJobs` 为 `[]` 且仍包含 `usage`
- [ ] **T7.10** 诊断 JSON 包含 `recentJobs` 和 `usage`；`recentJobs` 包含最近导入写入 / 刷新索引变更 / 重建任务的状态、数量摘要和失败摘要；失败文本、summary key / value 中的 URL userinfo、Bearer token、`Authorization: ...`、`Proxy-Authorization: ...`、`Cookie: ...`、`Set-Cookie: ...`、`proxy-authorization=...`、`cookie=...`、`set-cookie=...`、`api_key=`、`token=`、`access-token=`、`refresh-token=`、`id_token=`、`client_secret=`、自定义 `*token=` / `*secret=`、`X-Api-Key: ...`、`secret: ...` 和 `sk-...` 不含明文；异常 NaN / Infinity 数字、BigInt / Symbol / function / undefined 和循环引用会归一化为 JSON-safe 值，负数 / 小数任务数量摘要会归一化为非负整数
- [ ] **T7.11** Hub → `最近任务` 和 `⌘P → View recent jobs`（中文界面：`查看最近任务`）都能打开任务历史面板
- [ ] **T7.12** 任务历史面板显示导入写入 / 刷新索引变更 / 重建任务的状态、耗时、数量摘要和失败明细；写入或读取历史时遇到畸形 / 倒序时间戳、NaN / Infinity 数量摘要，不会让异常记录进入面板或 JSON；URL query / fragment / hash-route 中的 `api_key=`、`access_token=`、`id_token=`、`client_secret=`、自定义 `*token=`，以及 Bearer token、`Proxy-Authorization: ...`、`Cookie: ...`、`Set-Cookie: ...`、`proxy-authorization=...`、`cookie=...`、`set-cookie=...`、`X-Api-Key: ...`、`access-token: ...`、`refresh-token: ...`、`secret: ...` 等失败文本在持久化前和读取旧历史时都会脱敏；负数 / 小数数量摘要显示和复制时归一化为非负整数；取消任务显示 cancelled 状态和数量摘要但不显示空失败明细；复制 JSON 时包含 status、summary 和 failures
- [ ] **T7.12a** 任务历史 JSON 复制失败时显示复制失败提示，modal 不关闭，历史列表和失败明细不丢失
- [ ] **T7.12b** 没有任何任务历史或任务历史读取失败时显示空状态，复制 JSON 按钮禁用；这两种空状态下，即使按钮事件被程序化触发，也不会写入空历史 JSON
- [ ] **T7.13** Hub → `本月用量` 和 `⌘P → View this month's usage`（中文界面：`查看本月用量`）都能打开用量面板
- [ ] **T7.14** 用量面板显示本月总 token、prompt / completion、按功能拆分和预算状态；解析服务商上报、记录 / 恢复 / 显示 / 复制时，异常 NaN / Infinity / 负数用量数字归一化为 0，小数 token 向下取整；复制 JSON 时包含 budget、monthTotal 和 perFeature 用量快照
- [ ] **T7.14a** 用量 JSON 复制失败时显示复制失败提示，用量面板不关闭，总量、预算进度和按功能拆分不丢失
- [ ] **T7.14b** 本月没有 AI token 用量时显示空状态，总量 / prompt / completion 为 0，复制 JSON 仍可用，且 payload 中 `monthTotal` 为 0、`perFeature` 为空对象
- [ ] **T7.14c** 本月 token 用量达到 Monthly token budget warning 阈值时，用量面板显示预算提醒
- [ ] **T7.14d** 未设置 Monthly token budget warning，或设置数据中出现 NaN / Infinity / 非正数预算阈值时，迁移层和用量面板都会归一化为未设置；用量面板显示未设置预算提醒和设置入口提示，复制 JSON 仍可用，且显式未设置和无效阈值导出的 `budget` 都为 `null`
- [ ] **T7.14e** 设置数据中出现小数 Monthly token budget warning 时，迁移层和用量面板都会向下取整；用量面板和复制 JSON 不显示小数预算

---

## 阶段 8：异常路径

### 8.1 网络失败

- [ ] **T8.1.1** 把 chat Provider Base URL 改成无效地址
- [ ] **T8.1.2** AI Role 运行失败时显示 Notice，不崩溃
- [ ] **T8.1.3** 搜索在 embedding Provider 失败时降级到 BM25
- [ ] **T8.1.4** 恢复 Provider 后功能恢复

### 8.2 索引文件损坏

- [ ] **T8.2.1** 关闭 Obsidian
- [ ] **T8.2.2** 修改 `<vault>/.obsidian/plugins/aether-note-llm/data.json` 中 `index.json` 字段为坏 JSON
- [ ] **T8.2.3** 重启后出现索引损坏提示
- [ ] **T8.2.4** Rebuild index 可恢复

### 8.3 设置文件损坏

- [ ] **T8.3.1** 关闭 Obsidian
- [ ] **T8.3.2** 修改 `settings.json` 字段为坏 JSON
- [ ] **T8.3.3** 重启后不崩溃，设置恢复默认
- [ ] **T8.3.4** `data.json` 出现 `settings.json.bak.<timestamp>` 备份字段

---

## 阶段 9：性能 / 极限

- [ ] **T9.1** 导入 50-100 条文本或书签，不出现 UI 长时间卡死
- [ ] **T9.2** 重建 100+ 篇 markdown 后，搜索响应体感 < 1s
- [ ] **T9.3** Diagnostics 与本月用量面板中的 token 用量与导入 / 搜索 / AI 操作量大致匹配
- [ ] **T9.4** 大批量导入可先预览选择；失败项不会阻断已成功项落库，结果清单能定位失败条目；写入失败项可重新打开 pending 预览继续处理
- [ ] **T9.5** 设置 Monthly token budget warning 后，首次跨过阈值时出现主动提醒，本月用量面板显示预算提醒；重启 Obsidian 后用量仍保留

---

## 回归测试模板

每次发布前至少跑：阶段 0、1、2、3.1、4、4.1、5、6、7、8.1。

任意一项失败都阻塞发布，先修代码或更新这份清单。

---

## Bug 报告模板

````markdown
**版本**：Aether Note LLM v[X.Y.Z]（看 manifest.json）
**Obsidian 版本**：[Settings → About]
**系统**：[macOS / Windows / Linux / iOS / Android + 版本]

**复现步骤**：

1. ...
2. ...
3. ...

**期望行为**：...
**实际行为**：...

**Diagnostics 报告**：

```json
{ ... 脱敏后的 JSON ... }
```

**控制台日志**：

```
...
```
````

---

## 维护规则

每次 UAT 跑完，如果发现步骤与当前产品不一致，当场更新本文档。历史设计稿可以保留旧状态，当前验收清单不能保留旧流程。
