# Aether Note LLM

**English** · **[简体中文](./README.md)**

> An Obsidian plugin that funnels your scattered notes, articles, and bookmarks into your vault, auto-tagged by AI, then recalled with hybrid BM25 + vector search whenever you ask in natural language.

<p>
  <a href="#-status">
    <img alt="status" src="https://img.shields.io/badge/status-v0.1%20code--complete-blue" />
  </a>
  <a href="#-which-ai-providers">
    <img alt="provider" src="https://img.shields.io/badge/AI-OpenAI%20compatible-orange" />
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

## 🎯 What problem does it solve

> "How did I debug that SwiftUI state loss last month again?" — every note you wrote, every web page you bookmarked, every paragraph you pasted should be one query away, not buried five folders deep.

Once installed in Obsidian, Aether lets you:

- **Ingest** scattered markdown / web articles / Chrome bookmarks / Notion ZIP exports into your vault with one paste
- **Distill** — AI auto-generates titles, tags, summaries; you only click `Approve / Discard / Merge`
- **Recall** — natural-language search across notes + bookmarks with snippet highlights and one-click jump-to-source
- **Rewrite** — select any paragraph in your editor → right-click → AI rewrite / summarize / extract

**Your data is always plain markdown in your vault.** Uninstall the plugin — the notes are still there, untouched.

---

## ✨ Core features at a glance

| Capability              | Keywords                                                                                  |
| ----------------------- | ----------------------------------------------------------------------------------------- |
| 🪄 Smart import         | markdown / paste / Notion ZIP / Chrome bookmarks JSON / URL list                          |
| 🧠 AI auto-metadata     | title / tags / summary / duplicate detection (vector cosine ≥ 0.92)                       |
| 📥 Inbox review         | Card-based approve / discard / merge into existing                                        |
| 🔍 Hybrid retrieval     | BM25 text + vector semantics, tunable α, auto-bias to BM25 when index is stale            |
| ✏️ Paragraph-level AI   | Select → right-click → rewrite / summarize / extract key points                           |
| 🔗 Searchable bookmarks | One search box for notes + bookmarks; click bookmark → opens default browser              |
| 🔌 Multi-provider       | Any OpenAI-compatible endpoint: DeepSeek / Kimi / GLM / OpenRouter / Ollama / self-hosted |
| 🎚 Per-feature model    | 6 features each bind to their own (provider, model)                                       |
| 💸 Token usage          | Monthly aggregate + budget warnings                                                       |
| 🩺 Diagnostics export   | One-click redacted JSON report with version / index / usage                               |

---

## 📌 Status

<table>
<tr>
<td valign="top" width="50%">

**v0.1 — Code-complete, not yet released**

- 30 commits, 46 source files, 30 test files
- 153 / 153 tests passing
- Core coverage: lines 89%, branches 80%, funcs 91%
- Plugin bundle 256 KB
- **Never used in a real vault yet** — first thing for any maintainer is hands-on testing

</td>
<td valign="top" width="50%">

**Next**

- Use in a real vault for a week
- Convert real pain points into v0.2 plan
- Roadmap candidates: RAG synthesised answers / long-doc splitting / browser extension / standalone Tauri app

See [📦 Phase snapshot (2026-05-17)](docs/snapshots/2026-05-17-v0.1-complete.md)

</td>
</tr>
</table>

---

## 🚀 Three ways to "open" it

<table>
<tr>
<td valign="top" width="33%" align="center">

### 🧪 Verify it works

<sub>1 minute, **no Obsidian, no API key needed**</sub>

```bash
pnpm install
pnpm --filter @aether/core build
pnpm --filter @aether/core smoke
```

Expected last line:
`=== 冒烟测试全部通过 ✓ ===`
(smoke tests all passed)

</td>
<td valign="top" width="33%" align="center">

### 🏠 Install in your Obsidian

<sub>10 minutes, **needs vault + API key**</sub>

Follow the [Getting Started guide](docs/contributing/getting-started.md):

1. `pnpm build`
2. Symlink `main.js` into your vault
3. Enable the plugin in Obsidian
4. Configure Provider + 5 Feature Bindings

</td>
<td valign="top" width="33%" align="center">

### 👨‍💻 Develop on it

<sub>Continuous, **needs Node 20+**</sub>

```bash
pnpm install
pnpm --filter aether-note-llm dev
```

esbuild watch, rebuild on save.

→ [Coding standards](docs/contributing/coding-standards.md)
→ [Architecture](docs/architecture/overview.md)

</td>
</tr>
</table>

---

## 🤖 Which AI providers

Any OpenAI-compatible endpoint works. **API keys never leave your machine** — they live only in the Obsidian plugin data directory (`data.json`).

| Provider      | Base URL                               | Notes                                           |
| ------------- | -------------------------------------- | ----------------------------------------------- |
| OpenAI        | `https://api.openai.com/v1`            | chat + embedding both available                 |
| DeepSeek      | `https://api.deepseek.com/v1`          | Cheap chat, **no embedding model**              |
| Zhipu GLM     | `https://open.bigmodel.cn/api/paas/v4` | chat + embedding                                |
| Moonshot Kimi | `https://api.moonshot.cn/v1`           | chat (long context)                             |
| SiliconFlow   | `https://api.siliconflow.cn/v1`        | Hosts `BAAI/bge-m3` — recommended for embedding |
| OpenRouter    | `https://openrouter.ai/api/v1`         | Multi-model aggregator                          |
| Ollama        | `http://localhost:11434/v1`            | Fully local, no key needed                      |
| LM Studio     | `http://localhost:1234/v1`             | Fully local, no key needed                      |

> **Typical combo**: `embedding → SiliconFlow + bge-m3`, everything else → `DeepSeek + deepseek-chat`. Monthly cost typically under a dollar of personal use.

---

## 🏗 Repository layout

```
packages/
  core/      @aether/core — pure-TypeScript business core, host-agnostic, zero obsidian deps
  plugin/    aether-note-llm — Obsidian plugin shell with ObsidianHostAdapter
docs/
  superpowers/specs/    product design specs
  superpowers/plans/    implementation plans
  architecture/         four architecture docs
  contributing/         four onboarding docs
  testing/              test strategy + UAT checklist
  snapshots/            phase snapshots
  user-guide.md         7 daily-use scenarios
```

---

## 📚 Full documentation

<table>
<tr><th width="40%" align="left">Start here</th><th width="60%" align="left">What it covers</th></tr>
<tr><td>📦 <a href="docs/snapshots/2026-05-17-v0.1-complete.md">Phase Snapshot: v0.1 Complete</a></td><td>Cross-section of the project right now, with decisions & trade-offs</td></tr>
<tr><td>🚀 <a href="docs/contributing/getting-started.md">Getting Started</a></td><td>60-second health check → install in Obsidian → dev loop</td></tr>
<tr><td>📘 <a href="docs/user-guide.md">User Guide</a></td><td>7 real scenarios + 8 common pitfalls</td></tr>
<tr><td>🧪 <a href="docs/testing/uat-checklist.md">UAT Checklist</a></td><td>Manual click-through list, must pass before release</td></tr>
</table>

<table>
<tr><th width="40%" align="left">Deep dive</th><th width="60%" align="left">What it covers</th></tr>
<tr><td>🗺 <a href="docs/architecture/overview.md">Architecture Overview</a></td><td>Three-layer architecture + data-flow diagrams</td></tr>
<tr><td>📦 <a href="docs/architecture/core-package.md">@aether/core internals</a></td><td>Module boundaries + where to put new features</td></tr>
<tr><td>🧩 <a href="docs/architecture/plugin-package.md">Plugin internals</a></td><td>Obsidian lifecycle + HostAdapter</td></tr>
<tr><td>💾 <a href="docs/architecture/data-formats.md">Data formats</a></td><td>frontmatter / plugin data / vault layout</td></tr>
</table>

<table>
<tr><th width="40%" align="left">Contributing</th><th width="60%" align="left">What it covers</th></tr>
<tr><td>⚙️ <a href="docs/contributing/development-setup.md">Development setup</a></td><td>Symlink scripts + dev loop</td></tr>
<tr><td>🎨 <a href="docs/contributing/coding-standards.md">Coding standards</a></td><td>TypeScript / architecture / testing / commits</td></tr>
<tr><td>🚢 <a href="docs/contributing/release-checklist.md">Release checklist</a></td><td>8-step release + first-time community-plugin submission</td></tr>
<tr><td>🧬 <a href="docs/testing/strategy.md">Test strategy</a></td><td>Three-layer testing philosophy</td></tr>
</table>

<table>
<tr><th width="40%" align="left">Original spec & plan</th><th width="60%" align="left">What it covers</th></tr>
<tr><td>📐 <a href="docs/superpowers/specs/2026-05-16-aether-note-llm-design.md">v0.1 Design Spec</a></td><td>11 sections, decision matrix, IA, extension hooks</td></tr>
<tr><td>🛠 <a href="docs/superpowers/plans/2026-05-16-aether-note-llm-v0.1-plan.md">v0.1 Implementation Plan</a></td><td>31 tasks each with code, tests, and commit script</td></tr>
</table>

> **Note**: Most of the deep-dive docs are in Chinese first. Pull requests translating them to English are very welcome.

---

## 🔐 Privacy

- **Data**: Every note is a plain markdown file in your vault. Uninstall → your notes stay.
- **API keys**: Stored only in Obsidian's plugin data dir (obfuscated; not in a keychain because Obsidian mobile lacks one).
- **AI calls**: Your pasted text goes only to **the provider you configured**. Aether collects nothing, telemetry-free.
- **Diagnostics**: `⌘P → Diagnostics export` produces a JSON report with **API keys automatically redacted**.

---

## 📄 License

MIT. See [LICENSE](LICENSE).

---

## 🙏 Acknowledgments

- [Obsidian](https://obsidian.md/) — the host we run inside
- [Orama](https://github.com/oramasearch/orama) — pure-JS hybrid search engine
- [gray-matter](https://github.com/jonschlinkert/gray-matter) — frontmatter parsing
- [ulid](https://github.com/ulid/javascript) — time-sortable global IDs
