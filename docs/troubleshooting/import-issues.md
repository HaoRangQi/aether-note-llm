# 导入功能故障排查指南

## 问题描述

导入后没有出现预览清单、预览清单为空、写入所选失败，或写入后的文件找不到。

## 根本原因

v0.2 的导入流程分成两段：

1. 解析来源并生成 `pending InboxItem`，然后打开预览清单；
2. 用户确认写入所选后，才写 vault 文件并更新索引。

因此排查时要先判断失败发生在“解析 / 预览”阶段，还是“写入 / 索引”阶段。

## 当前错误处理

- 解析失败项会在预览 / 结果中显示失败原因，不会写入 vault。
- 写入失败项会保留为 pending，可从 Hub 待处理入口或命令面板继续处理。
- 导入写入、刷新索引和重建索引都会进入最近任务，可复制失败摘要。
- URL-only bookmark 不会调用 AI metadata 和 embedding，因此 URL 列表在未配置 AI 时也可进入预览。

相关文件：

- `packages/plugin/src/modals/import-modal.ts`
- `packages/core/src/import/pipeline.ts`
- `packages/plugin/src/ui/job-tracker.ts`
- `packages/plugin/src/job-history.ts`

## 常见失败原因

### 1. AI Role 未配置

**症状**：粘贴普通文本导入时 metadata 使用 fallback，或 AI metadata 失败。

**原因**：`inbox_metadata` AI Role 未绑定 Provider / Model，或对应 Provider 不可用。

**解决方案**:

1. 打开 `Settings → Aether Note LLM → AI Providers`。
2. 添加或检查一个 enabled Provider，并点击 Test。
3. 回到 Quick Start 应用绑定，或在 AI Roles 中手动为 `inbox_metadata` 选择 Provider / Model。
4. 若暂时没有 AI，URL-only bookmark 仍可导入；普通文本会尽量 fallback 到来源标题。

### 2. API Key 无效或缺失

**症状**：导入或写入时提示 `API_KEY_MISSING`、`PROVIDER_HTTP_ERROR`，或任务历史里出现 Provider 错误。

**解决方案**:

1. 检查 AI Providers 中的 API Key。
2. 重新输入 key。
3. 点击 Test 验证连接。
4. 打开 Hub 的最近任务查看失败摘要。

### 3. 网络连接问题

**症状**：导入准备、重复检测或写入索引时超时 / 网络错误。

**解决方案**:

1. 检查网络连接
2. 如果使用本地模型（Ollama），确认服务正在运行
3. 检查防火墙设置

### 4. 文本为空或文件类型不支持

**症状**：导入入口提示空内容或不支持的文件类型。

**解决方案**:

- 粘贴模式需要输入非空内容。
- 文件模式支持 `.md` / `.markdown` / `.txt` / `.url` / `.json` / `.itabdata`。
- `.json` 会按 Chrome / Edge bookmarks 或 iTab 数据解析；其他 JSON 结构可能不会产生条目。

### 5. URL 列表为空

**症状**：URL 列表导入后提示 0 项。

**原因**：URL 列表只接受完整 `http(s)` URL。

**解决方案**：

- 确认每行是 `https://example.com/...` 或 `http://example.com/...`。
- `mailto:`、无协议文本、普通文本会被跳过。
- Chrome / Edge 书签中的 `javascript:`、`file:`、`chrome:` 会被跳过。

## 调试步骤

### 1. 打开开发者控制台

**Obsidian 桌面版**:

- macOS: `Cmd + Option + I`
- Windows/Linux: `Ctrl + Shift + I`

### 2. 查看控制台日志

导入时查找以下日志：

```text
[Aether Import] Error: ...
[Aether] proposeMetadata failed, using fallback: ...
[Aether] Duplicate detection failed: ...
```

### 3. 测试最小文本导入

在导入对话框中粘贴：

```text
这是一个测试笔记

测试内容，用于验证导入功能是否正常工作。
```

点击导入，观察：

- 是否出现预览清单？
- 预览清单中标题、摘要、标签是否可编辑？
- 点击写入所选后是否出现结果清单？
- 控制台是否有错误？
- Hub 最近列表是否出现新文件？

### 4. 测试 URL-only bookmark

粘贴：

```text
https://example.com/a
https://example.com/b
```

这条路径不依赖 AI metadata 或 embedding。若仍然没有预览，优先检查 URL 解析和导入入口，而不是 Provider。

### 5. 检查配置完整性

运行以下检查：

1. `Settings → Aether Note LLM → AI Providers`：至少有一个 enabled Provider。
2. `Settings → Aether Note LLM → AI Roles`：`inbox_metadata` 和 `embedding` 已按需绑定 Provider / Model。
3. 点击 Provider 的 Test 按钮，确认连接成功。

## 降级方案

如果 AI 功能无法使用，导入仍然可以工作，但会使用 fallback 逻辑：

- 标题：使用内容第一行或 "Untitled"
- 标签：空数组
- 摘要：空字符串
- 重复检测：跳过
- URL-only bookmark：使用 URL 尾段或 hostname 作为标题，不调用 AI。

## 报告问题

如果问题仍未解决，请提供以下信息：

1. **Obsidian 版本**: 帮助 → 关于
2. **插件版本**: 设置 → 社区插件 → Aether Note LLM
3. **控制台日志**: 复制所有 `[Aether` 开头的日志
4. **最近任务 JSON**: Hub → 最近任务 → Copy JSON
5. **配置截图**: AI Providers 和 AI Roles 配置
6. **重现步骤**: 详细描述操作流程

提交到: https://github.com/your-repo/aether-note-llm/issues

## 版本历史

- **v0.1.x**: 初始导入链路，错误处理和用户反馈较弱
- **v0.2.0**: Hub + Import Preview + AI Roles；写入失败项可 pending 续处理，URL-only bookmark 走低成本导入路径
- **v0.2 hardening**: 导入取消、重复 URL 跳过、非法书签协议过滤、任务历史 / Diagnostics 脱敏、剪贴板失败提示和取消状态一致性已加固
