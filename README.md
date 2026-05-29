# Aether Note LLM

**[English](./README.en.md)** · **简体中文**

> 让散落各处的笔记 / 文章 / 书签智能流入你的 Obsidian vault，AI 帮你打标分类，再用 BM25 + 向量混合检索召回过去的经验。

<p>
  <a href="#-状态">
    <img alt="status" src="https://img.shields.io/badge/状态-v0.3%20P0%20hardening-blue" />
  </a>
  <a href="#-用什么-ai-服务">
    <img alt="provider" src="https://img.shields.io/badge/AI-OpenAI%20兼容-orange" />
  </a>
  <a href="./docs/testing/strategy.md">
    <img alt="tests" src="https://img.shields.io/badge/tests-399%20passed-brightgreen" />
  </a>
  <a href="./docs/architecture/core-package.md">
    <img alt="coverage" src="https://img.shields.io/badge/coverage-90.5%25-brightgreen" />
  </a>
  <a href="./LICENSE">
    <img alt="license" src="https://img.shields.io/badge/license-MIT-lightgrey" />
  </a>
</p>

---

## 🎯 它解决什么问题

> "上次解决 SwiftUI 状态丢失是怎么搞的来着？" —— 你写过的笔记、收藏过的网页、甚至随手粘贴过的一段思考，应该都能被一句话召回，而不是埋在某个深 5 层的目录里。

Aether 装到 Obsidian 后，你可以：

- **吸纳**：把散落的 markdown、目录批量 markdown、粘贴文本、Chrome 书签和 URL 列表一键塞进 vault（URL 列表保存链接，不自动抓取网页正文）
- **沉淀**：AI 自动起标题、打标签、写摘要和推荐分类，预览确认后按 `分类/年/月` 写入 `Aether Inbox/`
- **召回**：自然语言搜索 → 跨笔记 / 跨书签 / 命中片段高亮 + 一键跳转原文
- **起效**：切到 `解决问题`，Aether 会召回历史资料并输出结论、步骤、风险和引用；确认后可保存为经验卡，继续参与后续检索
- **重写**：编辑器里选中任意段落 → 右键 AI 改写 / 总结 / 提要点

**所有数据始终是 vault 里的纯 markdown。** 卸载插件 → 笔记原封不动还在那。

---

## ✨ 30 秒看核心能力

| 能力                 | 关键词                                                                                       |
| -------------------- | -------------------------------------------------------------------------------------------- |
| 🪄 智能导入          | markdown 文件 / 目录批量导入（.md/.markdown）/ 粘贴文本 / Chrome 书签 JSON / iTab / URL 列表 |
| 🧠 AI 自动元数据     | 标题 / 标签 / 摘要 / 推荐分类 / 重复检测（向量 cosine ≥ 0.92）                               |
| 🧭 Hub 主面板        | 搜索 / 最近导入 / 快速导入 / Provider 状态集中到一个入口                                     |
| 🔍 混合检索          | BM25 文本 + 向量语义；Hub 显示 Hybrid / BM25 / Stale-biased 与降级原因                       |
| 💬 综合回答          | 基于当前搜索结果生成带引用回答，引用可打开笔记或书签                                         |
| ✅ 解决问题          | 从历史资料生成结构化方案：结论 / 步骤 / 历史依据 / 风险 / 来源，可保存为经验卡               |
| ✏️ 段落级 AI 辅助    | 选中段 → 右键 → rewrite / summarize / extract                                                |
| 🔗 书签搜得到 + 点开 | 书签和笔记同搜索框；命中点击打开默认浏览器                                                   |
| 🔌 多 Provider 接入  | 任何 OpenAI 兼容端点：DeepSeek / Kimi / 智谱 / OpenRouter / Ollama / 自托管                  |
| 🎭 AI 角色           | 内置 / 自定义 Role 可分别绑定 Provider、模型、提示词和参数，提示词变量会被诊断               |
| 💸 token 用量统计    | 月度聚合 + 预算告警                                                                          |
| 🧾 最近任务          | 目录后台导入 / 导入写入 / 刷新变更 / 重建任务状态、耗时、数量摘要和失败明细                  |
| 🩺 诊断包导出        | 一键脱敏报告，含版本 / 索引 / 最近任务 / 用量                                                |

---

## 📌 状态

<table>
<tr>
<td valign="top" width="50%">

**v0.3 — P0 hardening，未发布**

- Hub 主面板已取代旧 Search / Inbox 双视图
- AI Role 已取代旧 Feature Binding，支持自定义编辑器角色
- 导入当前走预览确认：生成 metadata 后先展示清单，写入用户勾选的条目
- 导入支持可配置分类，默认按 `教程 / AI 提示词 / 生活 / 历史 / 工作 / 其他` 写入 `分类/年/月`
- 新增目录导入 tab：可按目录批量后台导入 `.md/.markdown`，进度持续显示并写入最近任务
- 新增整理已有笔记命令：先预览分类移动计划，用户确认后再移动文件
- Hub 新增 `解决问题` 模式：先检索历史经验，再生成带引用的结构化解决方案，并可保存为经验卡
- 写入失败的导入项可从结果页、Hub 待处理入口或命令面板继续处理
- 搜索在 embedding 缺失或 Provider 短暂失败时降级到 BM25，并在 Hub 展示当前模式与原因
- 搜索结果页已支持基于当前命中的综合回答和引用跳转
- **仍需真实 vault 长期使用验证** —— 发布前首推 UAT

</td>
<td valign="top" width="50%">

**接下来**

- 在真实 vault 用一周
- 强化综合回答的引用质量校验与长上下文压缩
- 长文智能拆分 / 浏览器扩展 / Tauri 独立桌面应用

详见 [📦 阶段性归档（2026-05-17）](docs/snapshots/2026-05-17-v0.1-complete.md)

</td>
</tr>
</table>

---

## 🚀 三种"打开"方式

<table>
<tr>
<td valign="top" width="33%" align="center">

### 🏠 装到 Obsidian（一键）

<sub>2 分钟，**推荐普通用户**</sub>

macOS / Linux：

```bash
./install.sh
```

Windows（PowerShell）：

```powershell
.\install.ps1
```

脚本会自动：检查环境 → 装依赖 → build → 找到你的 vault → 链好插件 → 告诉你**接下来在 Obsidian 里点哪几下**。

</td>
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

<details>
<summary>🛠 不想用一键脚本？手动 4 步装</summary>

```bash
# 1) 装依赖 + build
pnpm install
pnpm --filter @aether/core build
pnpm --filter aether-note-llm build

# 2) 软链 3 个产物到你的 vault
VAULT="$HOME/Documents/你的vault名字"
mkdir -p "$VAULT/.obsidian/plugins/aether-note-llm"
ln -sf "$(pwd)/packages/plugin/main.js"       "$VAULT/.obsidian/plugins/aether-note-llm/main.js"
ln -sf "$(pwd)/packages/plugin/manifest.json" "$VAULT/.obsidian/plugins/aether-note-llm/manifest.json"
ln -sf "$(pwd)/packages/plugin/styles.css"    "$VAULT/.obsidian/plugins/aether-note-llm/styles.css"

# 3) 打开 Obsidian → Settings → Community plugins → 启用
# 4) Settings → Aether Note LLM → 配 Provider
```

详细的环境前置 / 故障排查见 [启动与接入指南](docs/contributing/getting-started.md)。

</details>

---

## 🤖 用什么 AI 服务

任何 OpenAI 兼容端点都行。Aether **不托管、不上传你的 API key 到 Aether 服务器**；key 仅存于 Obsidian 插件数据目录（重命名为 `data.json`），并只在调用你配置的 Provider 时发送给该 Provider。

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

> **典型组合**：`embedding → SiliconFlow + bge-m3`，其余功能 → `DeepSeek + deepseek-chat`。Aether 会展示服务商上报的 token 用量并支持月度 token 阈值提醒；解析服务商上报、记录和恢复用量时都会把异常负数 / 小数 token 归一化为非负整数；实际费用以各服务商账单为准。

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
<tr><td>📦 <a href="docs/snapshots/2026-05-17-v0.1-complete.md">阶段性归档：v0.1 完成</a></td><td>历史横切面快照，含 v0.1 决策与权衡</td></tr>
<tr><td>🚀 <a href="docs/contributing/getting-started.md">启动与接入指南</a></td><td>60 秒健康检查 → 装到 Obsidian → 开发循环</td></tr>
<tr><td>📘 <a href="docs/user-guide.md">日常使用指南</a></td><td>7 个真实场景 + 9 个常见坑</td></tr>
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
<tr><td>🚢 <a href="docs/contributing/release-checklist.md">发布清单</a></td><td>发布验证、远程提交准备 + 社区插件首次提交</td></tr>
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
- **API key**：仅本机存储于 Obsidian 插件数据目录（混淆，不上 keychain；**移动端 Obsidian 没 keychain**，所以当前版本不依赖它）。调用模型时会按需发送给你配置的 Provider。
- **AI 调用**：你 paste 进来的文本会经过你**自己配置的** Provider。Aether 不收数据、不打点、不发送到 Aether 服务器；如果内容包含私密文件、密钥或密码，优先使用本地模型或可信自部署服务。
- **最近任务 / 诊断包**：`⌘P → View recent jobs` 可先看导入 / 刷新索引 / 重建失败摘要；任务历史写入和读取都会忽略畸形、倒序时间戳与非有限数值摘要，并把负数 / 小数数量摘要归一化为非负整数；`⌘P → Diagnostics export` 出 JSON 报告时**自动脱敏 API key**，并把异常数值和非 JSON 值归一化为 JSON-safe 值。

---

## 📄 License

MIT。详见 [LICENSE](LICENSE)。

---

## 🙏 致谢

- [Obsidian](https://obsidian.md/) — 把它当作宿主
- [Orama](https://github.com/oramasearch/orama) — 纯 JS hybrid 搜索引擎
- [gray-matter](https://github.com/jonschlinkert/gray-matter) — frontmatter 解析
- [ulid](https://github.com/ulid/javascript) — 时间有序的全局 ID
