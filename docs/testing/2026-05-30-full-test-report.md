# 2026-05-30 全栈测试报告

## 报告范围

本报告覆盖 Aether Note LLM 当前工作树的项目级测试分析、测试计划、测试用例设计、自动化测试补充、静态审查和执行模拟。

| 项目         | 内容                                                                                                       |
| ------------ | ---------------------------------------------------------------------------------------------------------- |
| 项目路径     | `/Users/macos/Downloads/Projects/aether-note-llm`                                                          |
| 版本         | `0.3.0`                                                                                                    |
| 技术栈       | TypeScript、pnpm workspace、Vitest、Obsidian plugin、host-agnostic core                                    |
| 测试重点     | import、search、answer、solve、privacy routing、diagnostics、index rebuild/refresh、Provider compatibility |
| 本轮代码变更 | 新增 2 个 P0 隐私安全回归测试                                                                              |

# 步骤 1：理解与分析

## 功能点与业务流程

| 模块               | 功能点                                                                                     | 关键路径                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| 导入 Import        | paste、file、directory、URL list、bookmarks、iTab、Notion zip；生成 `InboxItem` 并预览确认 | `ImportModal -> AetherCore.importSource -> ImportPipeline -> InboxStore -> approve/merge/discard` |
| Inbox 状态         | `pending`、`approved`、`discarded`、`merged`，支持失败项恢复                               | `InboxStore`、`ImportPreviewModal`                                                                |
| 索引 Index         | chunk、embedding、BM25-only、rebuild、refresh、stale health                                | `AetherCore.indexExistingVaultFile`、`rebuildAll`、`refreshChangedIndex`                          |
| 搜索 Search        | Hybrid、BM25 fallback、stale-biased、note/bookmark filter、privacy scope                   | `SearchEngine.searchWithMeta`                                                                     |
| 综合回答 Answer    | 基于 search hits 选上下文，生成带引用回答，检查 citation 质量                              | `AetherCore.answerSearch`、`HubView.renderAnswerPanel`                                            |
| 解决问题 Solve     | 生成结构化 solution、风险、证据和来源，可保存经验卡                                        | `AetherCore.solveProblem`、`saveExperienceCard`                                                   |
| AI Role            | 内置 / 自定义 Role，支持 summarize、rewrite、extract、answer、solve、metadata、embedding   | `RoleRegistry`、`runRole`                                                                         |
| Provider           | OpenAI-compatible models、chat、embedding、SSE、usage 归一化                               | `OpenAICompatibleProvider`                                                                        |
| Privacy Routing    | private folders、trusted provider、private role binding、private BM25 fallback             | `resolvePrivateRoute`、`searchOptionsForScope`                                                    |
| Diagnostics / Jobs | recent jobs、usage、diagnostics JSON、脱敏导出                                             | `diagnostics-report.ts`、`job-history.ts`、`job-tracker.ts`                                       |

## 核心领域模型

| 模型               | 说明                                                | 测试关注点                           |
| ------------------ | --------------------------------------------------- | ------------------------------------ |
| `Note`             | vault 内可检索实体，含 `contentHash`、`indexState`  | 文件和索引一致性、删除/移动/重建     |
| `Chunk`            | 检索片段，含 heading、token、embedding              | embedding dim、上下文截断            |
| `InboxItem`        | 导入预览项，承载 AI metadata 和状态                 | 取消、失败、恢复、批次归档           |
| `AiRole`           | AI 能力绑定，含 provider/model/private route/prompt | 禁用、缺变量、私密路由               |
| `ProviderConfig`   | Provider 配置和 API key ref                         | key 缺失、baseUrl 校验、trusted 标记 |
| `SearchResponse`   | hits + mode/fallback metadata                       | BM25 fallback、scope 过滤            |
| `ProblemSolution`  | solve 输出结构                                      | LLM 输出解析失败、低置信 fallback    |
| plugin `data.json` | settings、inbox、index、usage、jobHistory           | 并发写、损坏恢复、脱敏               |

## 潜在风险点

| 优先级 | 风险                                 | 原因                                                  |
| ------ | ------------------------------------ | ----------------------------------------------------- |
| P0     | 私密内容外发                         | public/private/all scope 与 trusted Provider 组合复杂 |
| P0     | diagnostics / jobHistory 泄露 secret | 错误文本、URL、headers 可能包含 key/token/cookie      |
| P0     | 导入写入和 merge 回滚失败            | 跨文件系统、index store、inbox 状态                   |
| P0     | embedding dim mismatch               | 切换 embedding 模型后 hybrid search 可能不可用        |
| P1     | 取消后 late provider result 污染 UI  | answer、editor role、import、rebuild 都支持取消       |
| P1     | Provider 兼容性                      | SSE、non-stream JSON、usage 字段、HTTP error、abort   |
| P1     | 大 vault 性能                        | rebuild、search、diagnostics 和 data.json 写入压力    |

# 步骤 2：测试计划制定

## 测试类型

| 类型              | 目标                                                                  | 优先级 | 执行方式                                    |
| ----------------- | --------------------------------------------------------------------- | ------ | ------------------------------------------- |
| 单元测试          | 纯函数、解析、状态机、脱敏、Provider adapter                          | P0     | Vitest                                      |
| 集成测试          | core 公开流程：import、approve、merge、search、answer、solve、rebuild | P0     | Vitest + InMemoryHostAdapter + MockProvider |
| Plugin UI 测试    | Hub、Modal、命令、Notice、clipboard、job tracker                      | P0     | Vitest + Obsidian fixture                   |
| Obsidian 手工 E2E | 真实 vault、真实插件启用、真实 UI 操作                                | P0     | `docs/testing/uat-checklist.md`             |
| API 兼容测试      | OpenAI-compatible chat/embedding/SSE/HTTP/abort                       | P0     | mock fetch                                  |
| 安全测试          | private routing、diagnostics 脱敏、external URL、secret handling      | P0     | unit + integration + UAT                    |
| 性能测试          | 大 vault、大批量导入、长文本、连续搜索                                | P1     | 专项脚本或手工采样                          |
| 兼容性测试        | macOS/Linux/Windows、中文/英文、Node/pnpm                             | P1     | CI + 手测矩阵                               |
| 静态测试          | typecheck、build、lint、format、audit                                 | P0     | pnpm scripts                                |

## 分模块策略

| 模块           | 策略                                                                 |
| -------------- | -------------------------------------------------------------------- |
| Import         | connector 单测 + core 集成 + modal UI + pending retry                |
| Index          | rebuild/refresh 集成、cancel、partial failure、dim mismatch          |
| Search         | hybrid/BM25/stale、filter、privacyScope、scanScope                   |
| Answer / Solve | context budget、citation check、private route block、experience card |
| Provider       | model list、SSE、JSON、retry、abort、usage normalization             |
| Diagnostics    | secret redaction、JSON-safe、copy failure                            |
| Plugin UI      | Hub request id、cancel、open failures、activity stacking             |

# 步骤 3：测试用例矩阵

## P0 用例

| ID         | 模块        | 场景                                    | 预期                                                |
| ---------- | ----------- | --------------------------------------- | --------------------------------------------------- |
| P0-IMP-001 | Import      | approve 写文件成功但 reindex 失败       | 删除新文件，store 回滚，InboxItem 可重试            |
| P0-IMP-002 | Import      | merge 后 reindex 失败                   | 目标文件与旧 chunks 恢复                            |
| P0-PRV-001 | Privacy     | private answer 无 trusted route         | 不调用 remote Provider，抛配置错误                  |
| P0-PRV-002 | Privacy     | private import 有 trusted route         | metadata 和 duplicate embedding 走 trusted Provider |
| P0-SEA-001 | Search      | embedding missing                       | BM25 fallback，meta 给出原因                        |
| P0-IDX-001 | Index       | embedding dim 切换                      | 提示 rebuild，rebuild 后恢复                        |
| P0-SEC-001 | Diagnostics | apiKey / Authorization / Cookie / token | 输出 `<redacted>`                                   |
| P0-API-001 | Provider    | 401 / 403                               | 不 retry 401，错误明确                              |

## P1 用例

| ID            | 模块          | 场景                            | 预期                            |
| ------------- | ------------- | ------------------------------- | ------------------------------- |
| P1-ANS-001    | Answer        | Provider 返回空白               | 显示空状态，不显示 copy/source  |
| P1-ANS-002    | Answer        | Cancel 后 late result           | 不渲染过期 answer               |
| P1-SOL-001    | Solve         | LLM 输出非结构化                | fallback solution，不崩溃       |
| P1-JOB-001    | Jobs          | refresh/rebuild partial failure | job status failed，保留失败摘要 |
| P1-PERF-001   | Performance   | 1k notes rebuild                | 进度稳定，内存可控              |
| P1-COMPAT-001 | Compatibility | Windows install script          | UTF-8、vault 路径、插件产物正确 |

## P2 用例

| ID         | 模块 | 场景            | 预期                         |
| ---------- | ---- | --------------- | ---------------------------- |
| P2-UI-001  | UI   | 中文/英文切换   | 命令、Settings、Hub 文案正确 |
| P2-UI-002  | UI   | 窄面板显示      | 关键按钮和文字不重叠         |
| P2-DOC-001 | Docs | README 测试数量 | 与当前测试基线同步           |

# 步骤 4：可执行测试代码

## 新增测试

| 文件                                               | 测试名称                                                                                   | 覆盖风险                             |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------ |
| `packages/core/tests/unit/app.test.ts`             | `does not call remote answer for private scope without a trusted route`                    | private answer 不外发                |
| `packages/core/tests/unit/import/pipeline.test.ts` | `routes private import metadata and duplicate detection through the trusted private route` | private import 使用 trusted Provider |

## 验证命令

| 命令                                                                             | 结果                                    |
| -------------------------------------------------------------------------------- | --------------------------------------- |
| `pnpm exec vitest run tests/unit/import/pipeline.test.ts tests/unit/app.test.ts` | 通过，40 tests                          |
| `pnpm --filter @aether/core test`                                                | 通过，261 tests                         |
| `pnpm test`                                                                      | 通过，core 261 + plugin 150 = 411 tests |

# 步骤 5：代码审查与静态测试

## 静态测试结果

| 命令                                                                                                               | 结果                                          |
| ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| `pnpm typecheck`                                                                                                   | PASS                                          |
| `pnpm build`                                                                                                       | PASS                                          |
| `pnpm lint`                                                                                                        | PASS                                          |
| `pnpm test`                                                                                                        | PASS，411 tests                               |
| `pnpm --filter @aether/core smoke`                                                                                 | PASS                                          |
| `pnpm --filter @aether/core test:coverage`                                                                         | PASS，Statements/Lines 91.21%，Branches 79.6% |
| `pnpm exec prettier --check packages/core/tests/unit/app.test.ts packages/core/tests/unit/import/pipeline.test.ts` | PASS                                          |
| `git diff --check`                                                                                                 | PASS                                          |
| `pnpm format:check`                                                                                                | FAIL，既有未触及文件格式问题                  |
| `pnpm audit --audit-level moderate`                                                                                | FAIL，2 个 moderate dev-chain 漏洞            |

## 审查发现

| 严重级别 | 发现                                             | 影响                             | 建议                                            |
| -------- | ------------------------------------------------ | -------------------------------- | ----------------------------------------------- |
| P1       | `esbuild <=0.24.2`、`vite <=6.4.1` moderate 漏洞 | dev server / optimized deps 风险 | 升级 esbuild、Vitest/Vite 依赖链                |
| P2       | `pnpm format:check` 不绿                         | CI / 发布门禁不稳定              | 单独格式化 `search-engine.ts`、`role-editor.ts` |
| P2       | Hub 使用 `innerHTML` 渲染高亮                    | 当前已转义，但长期容易误用       | 后续迁移为 DOM builder                          |
| P2       | Provider HTTP error 保留远端响应文本             | 展示链路必须持续脱敏             | 在错误边界统一 redaction                        |

# 步骤 6：测试执行模拟

## 自动执行

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm build
pnpm test
pnpm --filter @aether/core test:coverage
pnpm --filter @aether/core smoke
pnpm format:check
pnpm audit --audit-level moderate
```

当前模拟结果：除 `format:check` 和 `audit` 外，其余自动门禁通过。

## 手工执行

按照 `docs/testing/uat-checklist.md` 在干净 Obsidian vault 中执行：

| 阶段   | 手测重点                                                |
| ------ | ------------------------------------------------------- |
| 阶段 0 | 自动化冒烟                                              |
| 阶段 1 | 安装、启用、Hub、命令面板                               |
| 阶段 2 | Provider、API key、trusted private provider、AI Roles   |
| 阶段 3 | paste/file/directory import、pending retry、merge、undo |
| 阶段 4 | search、answer、solve、private/public/all scope         |
| 阶段 5 | editor AI Role、copy/replace/cancel                     |
| 阶段 6 | 重启恢复、settings/index 持久化                         |
| 阶段 7 | refresh/rebuild、job history、usage、diagnostics        |

## 模拟输入与预期

| 输入                                                         | 预期输出                                         | 实际可能问题                            |
| ------------------------------------------------------------ | ------------------------------------------------ | --------------------------------------- |
| `Private/incident.md` + private answer + no trusted provider | 抛 `BINDING_NOT_FOUND`，chat calls = 0           | 若回归，私密内容可能外发                |
| private import + trusted route                               | metadata/chat 和 embedding 均走 trusted Provider | Role 迁移错误可能导致走 public Provider |
| 粘贴 SwiftUI 文本并 approve                                  | 写入 `Aether Inbox/...md`，搜索可命中            | metadata fallback 需保持可用            |
| diagnostics 文本含 `Authorization`、`api_key`、Cookie        | 输出 `<redacted>`                                | 新 secret 格式需补测试                  |
| 删除已索引文件后 refresh                                     | 搜索不再命中，job 记录 removed                   | 文件系统 race 可能变 partial failure    |

# 整体测试报告总结

## 结论

当前项目自动化测试基础扎实，本轮已完成 6 个要求步骤，并新增 2 个 P0 隐私安全回归测试。核心自动化、构建、类型检查、lint、smoke 和 coverage 均通过。

发布前仍不建议跳过真实 Obsidian UAT，因为当前仓库未使用 browser-driver E2E，真实插件生命周期、Obsidian API、vault 权限和系统剪贴板仍需人工环境验证。

## 当前证据

| 证据                     | 结果                                    |
| ------------------------ | --------------------------------------- |
| 全量自动化测试           | 411 tests passed                        |
| Core coverage            | 91.21% statements/lines，79.6% branches |
| Core smoke               | `=== 冒烟测试全部通过 ✓ ===`            |
| Typecheck / build / lint | PASS                                    |
| 工作树变更               | 仅 2 个 core test 文件                  |

# 高优先级风险清单

| 优先级 | 风险                                   | 状态                     |
| ------ | -------------------------------------- | ------------------------ |
| P1     | 依赖审计 moderate 漏洞：esbuild、vite  | 未修复                   |
| P1     | 真实 Obsidian UAT 未执行               | 需人工验证               |
| P2     | 全仓库格式化门禁不绿                   | 未修复                   |
| P2     | Hub `innerHTML` 高亮渲染为长期安全热点 | 有测试保护，建议后续治理 |

# 建议改进点

| 优先级 | 建议                                                                                                  |
| ------ | ----------------------------------------------------------------------------------------------------- |
| P1     | 升级 `esbuild >=0.24.3`，升级 Vitest/Vite 依赖链到包含 `vite >=6.4.2` 的版本                          |
| P1     | 发布前完整执行 `docs/testing/uat-checklist.md`，重点验证 private route、diagnostics、directory import |
| P2     | 单独格式化 `packages/core/src/search/search-engine.ts` 和 `packages/plugin/src/modals/role-editor.ts` |
| P2     | 将 Hub 高亮渲染从 `innerHTML` 迁移为 DOM node builder                                                 |
| P2     | 增加性能专项脚本：1k notes rebuild、200 item import、长文 answer context                              |
