# Aether Note LLM

> Obsidian plugin — personal knowledge base AI assistant.
> Hybrid BM25 + vector search across your notes, AI-assisted import inbox,
> and paragraph-level rewrite / summarize / extract — all driven by an
> OpenAI-compatible multi-provider configuration.

**Status:** v0.1 — Obsidian Plugin (this repository). Independent desktop
app is a future direction; see `docs/architecture/overview.md`.

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
