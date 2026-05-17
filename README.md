# Aether Note LLM

**[English](./README.en.md)** · **简体中文**

> 让散落各处的笔记 / 文章 / 书签智能流入你的 Obsidian vault，AI 帮你打标分类，再用 BM25 + 向量混合检索召回过去的经验。

<p>
  <a href="#-状态">
    <img alt="status" src="https://img.shields.io/badge/状态-v0.1%20代码完成-blue" />
  </a>
  <a href="#-用什么-ai-服务">
    <img alt="provider" src="https://img.shields.io/badge/AI-OpenAI%20兼容-orange" />
  </a>
  <a href="./docs/testing/strategy.md">
    <img alt="tests" src="https://img.shields.io/badge/tests-153%20passed-brightgreen" />
  </a>
  <a href="./docs/architecture/core-package.md">
    <img alt="coverage" src="https://img.shields.io/badge/coverage-89%25-brightgreen" />
  </a>
  <a href="./LICENSE">
    <img alt="license" src="https://img.shields.io/badge/license-MIT-lightgrey" />
  </a>
</p>

---

## 🎯 它解决什么问题

> "上次解决 SwiftUI 状态丢失是怎么搞的来着？" —— 你写过的笔记、收藏过的网页、甚至随手粘贴过的一段思考，应该都能被一句话召回，而不是埋在某个深 5 层的目录里。

Aether 装到 Obsidian 后，你可以：

- **吸纳**：把散落的 markdown / 网页正文 / Chrome 书签 / Notion 导出 ZIP 一键塞进 vault
- **沉淀**：AI 自动起标题、打标签、写摘要，你只负责按"接受 / 丢弃 / 合并"
- **召回**：自然语言搜索 → 跨笔记 / 跨书签 / 命中片段高亮 + 一键跳转原文
- **重写**：编辑器里选中任意段落 → 右键 AI 改写 / 总结 / 提要点

**所有数据始终是 vault 里的纯 markdown。** 卸载插件 → 笔记原封不动还在那。

---

## ✨ 30 秒看核心能力

| 能力                 | 关键词                                                                      |
| -------------------- | --------------------------------------------------------------------------- |
| 🪄 智能导入          | markdown / 粘贴文本 / Notion ZIP / Chrome 书签 JSON / URL 列表              |
| 🧠 AI 自动元数据     | 标题 / 标签 / 摘要 / 重复检测（向量 cosine ≥ 0.92）                         |
| 📥 Inbox 待审        | 卡片式审核：approve / discard / merge into existing                         |
| 🔍 混合检索          | BM25 文本 + 向量语义；α 可调；stale 状态自动偏 BM25                         |
| ✏️ 段落级 AI 辅助    | 选中段 → 右键 → rewrite / summarize / extract                               |
| 🔗 书签搜得到 + 点开 | 书签和笔记同搜索框；命中点击打开默认浏览器                                  |
| 🔌 多 Provider 接入  | 任何 OpenAI 兼容端点：DeepSeek / Kimi / 智谱 / OpenRouter / Ollama / 自托管 |
| 🎚 每功能独选模型    | 6 个 feature 分别绑定 Provider + 模型名                                     |
| 💸 token 用量统计    | 月度聚合 + 预算告警                                                         |
| 🩺 诊断包导出        | 一键脱敏报告，含版本 / 索引 / 用量                                          |

---

## 📌 状态

<table>
<tr>
<td valign="top" width="50%">

**v0.1 — 代码完成，未发布**

- 30 个 commit，46 个源文件，30 个测试文件
- 153 / 153 测试通过
- 核心覆盖率：lines 89%、branches 80%、funcs 91%
- 插件 bundle 256 KB
- **未在真实 vault 长期使用过** —— 接手者首推手测

</td>
<td valign="top" width="50%">

**接下来**

- 在真实 vault 用一周
- 攒下来的痛点 → v0.2 plan
- 路线图候选：RAG 综合回答 / 长文智能拆分 / 浏览器扩展 / Tauri 独立桌面应用

详见 [📦 阶段性归档（2026-05-17）](docs/snapshots/2026-05-17-v0.1-complete.md)

</td>
</tr>
</table>

---

## 🚀 三种"打开"方式

<table>
<tr>
<td valign="top" width="33%" align="center">

### 🧪 验证项目能跑

<sub>1 分钟，**无需 Obsidian、无需 API key**</sub>

```bash
pnpm install
pnpm --filter @aether/core build
pnpm --filter @aether/core smoke
```

期望看到：
`=== 冒烟测试全部通过 ✓ ===`

</td>
<td valign="top" width="33%" align="center">

### 🏠 装到自己 Obsidian

<sub>10 分钟，**需要 vault + API key**</sub>

照着 [启动与接入指南](docs/contributing/getting-started.md) 走：

1. `pnpm build`
2. 软链 main.js 到 vault
3. Obsidian 启用插件
4. Settings → 配 Provider + 5 个 Feature Binding

</td>
<td valign="top" width="33%" align="center">

### 👨‍💻 二次开发

<sub>持续，**需要 Node 20+**</sub>

```bash
pnpm install
pnpm --filter aether-note-llm dev
```

esbuild watch，保存即重建。

→ [开发约定](docs/contributing/coding-standards.md)
→ [架构总览](docs/architecture/overview.md)

</td>
</tr>
</table>

---

## 🤖 用什么 AI 服务

任何 OpenAI 兼容端点都行。**API key 不出本机**，仅存于 Obsidian 插件数据目录（重命名为 `data.json`）。

| 服务          | Base URL                               | 适合什么                                        |
| ------------- | -------------------------------------- | ----------------------------------------------- |
| OpenAI 官方   | `https://api.openai.com/v1`            | chat + embedding 都有，国内需自备代理           |
| DeepSeek      | `https://api.deepseek.com/v1`          | 国内可用，便宜 chat；**无 embedding**           |
| 智谱 GLM      | `https://open.bigmodel.cn/api/paas/v4` | chat + embedding                                |
| Moonshot Kimi | `https://api.moonshot.cn/v1`           | chat（长上下文）                                |
| SiliconFlow   | `https://api.siliconflow.cn/v1`        | **有 `BAAI/bge-m3`** —— 推荐作为 embedding 后端 |
| OpenRouter    | `https://openrouter.ai/api/v1`         | 聚合多家，一个 key 多模型                       |
| Ollama        | `http://localhost:11434/v1`            | 完全本地，无需 key                              |
| LM Studio     | `http://localhost:1234/v1`             | 完全本地，无需 key                              |

> **典型组合**：`embedding → SiliconFlow + bge-m3`，其余功能 → `DeepSeek + deepseek-chat`。月度成本通常个位数人民币。

---

## 🏗 仓库布局

```
packages/
  core/      @aether/core — 纯 TypeScript 业务核心，host-agnostic，零 obsidian 依赖
  plugin/    aether-note-llm — Obsidian 插件薄壳，包含 ObsidianHostAdapter
docs/
  superpowers/specs/    产品设计 spec
  superpowers/plans/    实施计划
  architecture/         架构 4 篇
  contributing/         贡献者 / 用户上手 4 篇
  testing/              测试策略 + UAT checklist
  snapshots/            阶段归档
  user-guide.md         日常使用 7 场景
```

---

## 📚 完整文档

<table>
<tr><th width="40%" align="left">先看这些</th><th width="60%" align="left">说明</th></tr>
<tr><td>📦 <a href="docs/snapshots/2026-05-17-v0.1-complete.md">阶段性归档：v0.1 完成</a></td><td>项目当前的横切面快照，含决策与权衡</td></tr>
<tr><td>🚀 <a href="docs/contributing/getting-started.md">启动与接入指南</a></td><td>60 秒健康检查 → 装到 Obsidian → 开发循环</td></tr>
<tr><td>📘 <a href="docs/user-guide.md">日常使用指南</a></td><td>7 个真实场景 + 8 个常见坑</td></tr>
<tr><td>🧪 <a href="docs/testing/uat-checklist.md">UAT 验收清单</a></td><td>手测打勾清单，发布前必跑</td></tr>
</table>

<table>
<tr><th width="40%" align="left">深入</th><th width="60%" align="left">说明</th></tr>
<tr><td>🗺 <a href="docs/architecture/overview.md">架构总览</a></td><td>三层架构 + 数据流大图</td></tr>
<tr><td>📦 <a href="docs/architecture/core-package.md">@aether/core 内部</a></td><td>核心包模块边界 + 加新功能在哪写</td></tr>
<tr><td>🧩 <a href="docs/architecture/plugin-package.md">插件内部</a></td><td>Obsidian 生命周期 + HostAdapter</td></tr>
<tr><td>💾 <a href="docs/architecture/data-formats.md">数据格式</a></td><td>frontmatter / plugin data / vault 布局</td></tr>
</table>

<table>
<tr><th width="40%" align="left">贡献 / 维护</th><th width="60%" align="left">说明</th></tr>
<tr><td>⚙️ <a href="docs/contributing/development-setup.md">开发环境</a></td><td>软链脚本 + dev 循环</td></tr>
<tr><td>🎨 <a href="docs/contributing/coding-standards.md">代码规范</a></td><td>TypeScript / 架构 / 测试 / 提交</td></tr>
<tr><td>🚢 <a href="docs/contributing/release-checklist.md">发布清单</a></td><td>8 步发布流程 + 社区插件首次提交</td></tr>
<tr><td>🧬 <a href="docs/testing/strategy.md">测试策略</a></td><td>三层测试理念</td></tr>
</table>

<table>
<tr><th width="40%" align="left">设计 / 计划原档</th><th width="60%" align="left">说明</th></tr>
<tr><td>📐 <a href="docs/superpowers/specs/2026-05-16-aether-note-llm-design.md">v0.1 设计文档</a></td><td>11 节，含决策表、信息架构、扩展位</td></tr>
<tr><td>🛠 <a href="docs/superpowers/plans/2026-05-16-aether-note-llm-v0.1-plan.md">v0.1 实施计划</a></td><td>31 个 task，每个含代码、测试、commit</td></tr>
</table>

---

## 🔐 隐私

- **数据**：所有笔记是 vault 里的普通 markdown。卸载插件后笔记原封不动。
- **API key**：仅本机存储于 Obsidian 插件数据目录（混淆，不上 keychain；**移动端 Obsidian 没 keychain**，所以 v0.1 不依赖它）。
- **AI 调用**：你 paste 进来的文本会经过你**自己配置的** Provider。Aether 不收数据、不打点、不外发。
- **诊断包**：`⌘P → Diagnostics export` 出 JSON 报告时**自动脱敏 API key**。

---

## 📄 License

MIT。详见 [LICENSE](LICENSE)。

---

## 🙏 致谢

- [Obsidian](https://obsidian.md/) — 把它当作宿主
- [Orama](https://github.com/oramasearch/orama) — 纯 JS hybrid 搜索引擎
- [gray-matter](https://github.com/jonschlinkert/gray-matter) — frontmatter 解析
- [ulid](https://github.com/ulid/javascript) — 时间有序的全局 ID
