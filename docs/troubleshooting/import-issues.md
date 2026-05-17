# 导入功能故障排查指南

## 问题描述

导入功能点击后没有任何反应，或显示 "Imported 0 item(s)" 但没有错误提示。

## 根本原因

v0.1 版本的导入功能缺少完善的错误处理机制，导致：
1. 导入失败时不显示错误信息
2. AI 配置问题被静默忽略
3. 用户无法判断失败原因

## 已修复的问题（v0.1.1+）

### 1. 增强的错误提示

**修改文件**: `packages/plugin/src/modals/import-modal.ts`

- ✅ 添加 try-catch 捕获异常
- ✅ 处理 `error` 类型的导入事件
- ✅ 区分"导入 0 项"和"导入失败"
- ✅ 在控制台输出详细错误日志

### 2. 管道级错误处理

**修改文件**: `packages/core/src/import/pipeline.ts`

- ✅ 包裹整个导入流程的 try-catch
- ✅ 单个项目失败不影响其他项目
- ✅ 捕获 `proposeMetadata` 异常并使用 fallback
- ✅ 改进重复检测的错误处理

## 常见失败原因

### 1. AI Provider 未配置

**症状**: 导入显示 0 项，控制台无错误

**原因**: `inbox_metadata` 功能未绑定 AI provider

**解决方案**:
1. 打开 Aether 设置
2. 添加一个 Provider（如 OpenAI、Ollama）
3. 在 "Feature bindings" 中为 `inbox_metadata` 选择 provider 和模型
4. 点击 "Test" 验证连接

### 2. API Key 无效或缺失

**症状**: 导入失败，提示 "API_KEY_MISSING" 或 "PROVIDER_HTTP_ERROR"

**解决方案**:
1. 检查 Provider 配置中的 API Key
2. 点击 "Edit key" 重新输入
3. 点击 "Test" 验证

### 3. 网络连接问题

**症状**: 导入超时或提示网络错误

**解决方案**:
1. 检查网络连接
2. 如果使用本地模型（Ollama），确认服务正在运行
3. 检查防火墙设置

### 4. 文本为空

**症状**: 点击导入后立即关闭，无任何提示

**解决方案**:
- 确保在文本框中输入了内容
- v0.1.1+ 会显示 "Please enter some text to import"

## 调试步骤

### 1. 打开开发者控制台

**Obsidian 桌面版**:
- macOS: `Cmd + Option + I`
- Windows/Linux: `Ctrl + Shift + I`

### 2. 查看控制台日志

导入时查找以下日志：
```
[Aether Import] Error: ...
[Aether] proposeMetadata failed, using fallback: ...
[Aether] Duplicate detection failed: ...
```

### 3. 测试最小示例

在导入对话框中粘贴：
```
这是一个测试笔记

测试内容，用于验证导入功能是否正常工作。
```

点击导入，观察：
- 是否显示成功消息？
- 控制台是否有错误？
- Inbox 视图中是否出现新项目？

### 4. 检查配置完整性

运行以下检查：
1. Settings → Aether → Providers: 至少有一个 enabled
2. Settings → Aether → Feature bindings: `inbox_metadata` 已配置
3. 点击 Provider 的 "Test" 按钮，确认返回 "Connected"

## 降级方案

如果 AI 功能无法使用，导入仍然可以工作，但会使用 fallback 逻辑：
- 标题：使用内容第一行或 "Untitled"
- 标签：空数组
- 摘要：空字符串
- 重复检测：跳过

## 报告问题

如果问题仍未解决，请提供以下信息：

1. **Obsidian 版本**: 帮助 → 关于
2. **插件版本**: 设置 → 社区插件 → Aether Note LLM
3. **控制台日志**: 复制所有 `[Aether` 开头的日志
4. **配置截图**: Provider 和 Feature bindings 配置
5. **重现步骤**: 详细描述操作流程

提交到: https://github.com/your-repo/aether-note-llm/issues

## 版本历史

- **v0.1.0**: 初始版本，错误处理不完善
- **v0.1.1**: 增强错误处理和用户反馈（本次修复）
