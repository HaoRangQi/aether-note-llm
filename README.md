# Aether Note LLM

> Obsidian plugin — personal knowledge base AI assistant.
> Hybrid BM25 + vector search across your notes, AI-assisted import inbox,
> and paragraph-level rewrite / summarize / extract — all driven by an
> OpenAI-compatible multi-provider configuration.

**Status:** v0.1 — Obsidian Plugin (this repository). Independent desktop
app is a future direction; see `docs/architecture/overview.md`.

📦 **阶段性归档**：[docs/snapshots/2026-05-17-v0.1-complete.md](docs/snapshots/2026-05-17-v0.1-complete.md) — v0.1 代码完成节点的完整快照，记录决策、限制、下一步钩子。隔了一段时间回来 / 接手维护从这里看。

## 🚀 启动 / 接入

新人 / 用户从这里开始：[**docs/contributing/getting-started.md**](docs/contributing/getting-started.md)

它在 60 秒内带你跑完：

1. 健康检查（不需要 Obsidian、不需要 API key 也能看完整业务流跑一遍）
2. 装进真实 Obsidian + 配 Provider + 走黄金路径
3. 进入开发循环 / 排查常见错误

最快的一行命令验证项目能跑：

```bash
pnpm install && pnpm --filter @aether/core build && pnpm --filter @aether/core smoke
```

期望最后输出：`=== 冒烟测试全部通过 ✓ ===`

## Repository layout

```
packages/
  core/      @aether/core — host-agnostic TypeScript business core
  plugin/    aether-note-llm — Obsidian plugin (thin shell over core)
docs/
  superpowers/specs/   product design specs
  superpowers/plans/   implementation plans
  architecture/        long-form architecture references
  contributing/        contribution & release workflow
  testing/             test strategy
```

## Quick start (development)

Prerequisites: Node ≥ 20, pnpm ≥ 11.

```bash
pnpm install
pnpm test          # runs core + plugin tests
pnpm typecheck     # checks every package
pnpm build         # builds @aether/core (dist/) and aether-note-llm (main.js)
```

To run the plugin in a real Obsidian vault during development, see
[docs/contributing/development-setup.md](docs/contributing/development-setup.md).

## Documentation

- **📦 阶段性归档（v0.1 完成快照）：** [docs/snapshots/2026-05-17-v0.1-complete.md](docs/snapshots/2026-05-17-v0.1-complete.md)
- **🚀 启动 / 接入指南（先看这个）：** [docs/contributing/getting-started.md](docs/contributing/getting-started.md)
- **Architecture overview:** [docs/architecture/overview.md](docs/architecture/overview.md)
- **Core package internals:** [docs/architecture/core-package.md](docs/architecture/core-package.md)
- **Plugin internals:** [docs/architecture/plugin-package.md](docs/architecture/plugin-package.md)
- **Data formats (frontmatter, plugin data):** [docs/architecture/data-formats.md](docs/architecture/data-formats.md)
- **Development setup:** [docs/contributing/development-setup.md](docs/contributing/development-setup.md)
- **Coding standards:** [docs/contributing/coding-standards.md](docs/contributing/coding-standards.md)
- **Release checklist:** [docs/contributing/release-checklist.md](docs/contributing/release-checklist.md)
- **Test strategy:** [docs/testing/strategy.md](docs/testing/strategy.md)

## License

MIT. See LICENSE.
