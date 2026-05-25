# Aether Note LLM

**English** · **[简体中文](./README.md)**

> An Obsidian plugin that funnels your scattered notes, articles, and bookmarks into your vault, auto-tagged by AI, then recalled with hybrid BM25 + vector search whenever you ask in natural language.

<p>
  <a href="#-status">
    <img alt="status" src="https://img.shields.io/badge/status-v0.3%20P0%20hardening-blue" />
  </a>
  <a href="#-which-ai-providers">
    <img alt="provider" src="https://img.shields.io/badge/AI-OpenAI%20compatible-orange" />
  </a>
  <a href="./docs/testing/strategy.md">
    <img alt="tests" src="https://img.shields.io/badge/tests-374%20passed-brightgreen" />
  </a>
  <a href="./docs/architecture/core-package.md">
    <img alt="coverage" src="https://img.shields.io/badge/coverage-90.5%25-brightgreen" />
  </a>
  <a href="./LICENSE">
    <img alt="license" src="https://img.shields.io/badge/license-MIT-lightgrey" />
  </a>
</p>

---

## 🎯 What problem does it solve

> "How did I debug that SwiftUI state loss last month again?" — every note you wrote, every web page you bookmarked, every paragraph you pasted should be one query away, not buried five folders deep.

Once installed in Obsidian, Aether lets you:

- **Ingest** scattered markdown, pasted text, Chrome bookmarks, and URL lists into your vault (URL lists store links; they do not fetch article bodies automatically)
- **Distill** — AI auto-generates titles, tags, summaries, then writes imported notes into `Aether Inbox/`
- **Recall** — natural-language search across notes + bookmarks with snippet highlights and one-click jump-to-source
- **Rewrite** — select any paragraph in your editor → right-click → AI rewrite / summarize / extract

**Your data is always plain markdown in your vault.** Uninstall the plugin — the notes are still there, untouched.

---

## ✨ Core features at a glance

| Capability              | Keywords                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------ |
| 🪄 Smart import         | markdown files / paste / Chrome bookmarks JSON / iTab / URL list                                       |
| 🧠 AI auto-metadata     | title / tags / summary / duplicate detection (vector cosine ≥ 0.92)                                    |
| 🧭 Hub view             | Search / recent imports / quick import / provider status in one daily entry point                      |
| 🔍 Hybrid retrieval     | BM25 text + vector semantics; Hub shows Hybrid / BM25 / Stale-biased and fallback reason               |
| 💬 Synthesised answers  | Generate cited answers from the current search results; citations open notes or bookmarks              |
| ✏️ Paragraph-level AI   | Select → right-click → rewrite / summarize / extract key points                                        |
| 🔗 Searchable bookmarks | One search box for notes + bookmarks; click bookmark → opens default browser                           |
| 🔌 Multi-provider       | Any OpenAI-compatible endpoint: DeepSeek / Kimi / GLM / OpenRouter / Ollama / self-hosted              |
| 🎭 AI roles             | Built-in and custom roles bind to provider, model, prompt, and params with prompt variable diagnostics |
| 💸 Token usage          | Monthly aggregate + budget warnings                                                                    |
| 🧾 Recent jobs          | Import / change refresh / rebuild status, duration, count summary, and failure details                 |
| 🩺 Diagnostics export   | One-click redacted JSON report with version / index / recent jobs / usage                              |

---

## 📌 Status

<table>
<tr>
<td valign="top" width="50%">

**v0.3 — P0 hardening, not yet released**

- Hub view replaces the old separate Search / Inbox views.
- AI Role replaces Feature Binding and supports custom editor roles.
- Imports show a metadata preview first, then write only the selected items into `Aether Inbox/`.
- Failed import writes can be resumed from the result modal, Hub pending entry, or command palette.
- Search falls back to BM25 when embedding config or provider calls are unavailable, and Hub shows the current mode and reason.
- Search results can now generate cited answers from the currently displayed hits.
- **Still needs long-running real-vault validation** before release.

</td>
<td valign="top" width="50%">

**Next**

- Use in a real vault for a week
- Improve answer citation quality checks and long-context compression
- Long-doc splitting / browser extension / standalone Tauri app

See [📦 Phase snapshot (2026-05-17)](docs/snapshots/2026-05-17-v0.1-complete.md)

</td>
</tr>
</table>

---

## 🚀 Three ways to "open" it

<table>
<tr>
<td valign="top" width="33%" align="center">

### 🏠 Install into Obsidian (one-click)

<sub>2 minutes, **recommended for users**</sub>

macOS / Linux:

```bash
./install.sh
```

Windows (PowerShell):

```powershell
.\install.ps1
```

The script auto-detects environment, installs deps, builds, finds your vault, links the plugin, and tells you **exactly what to click in Obsidian next**.

</td>
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

<details>
<summary>🛠 Don't want the one-click script? Manual 4-step install</summary>

```bash
# 1) Install deps + build
pnpm install
pnpm --filter @aether/core build
pnpm --filter aether-note-llm build

# 2) Symlink 3 artifacts into your vault
VAULT="$HOME/Documents/your-vault-name"
mkdir -p "$VAULT/.obsidian/plugins/aether-note-llm"
ln -sf "$(pwd)/packages/plugin/main.js"       "$VAULT/.obsidian/plugins/aether-note-llm/main.js"
ln -sf "$(pwd)/packages/plugin/manifest.json" "$VAULT/.obsidian/plugins/aether-note-llm/manifest.json"
ln -sf "$(pwd)/packages/plugin/styles.css"    "$VAULT/.obsidian/plugins/aether-note-llm/styles.css"

# 3) Open Obsidian → Settings → Community plugins → enable
# 4) Settings → Aether Note LLM → configure Provider
```

For prerequisites and troubleshooting see [Getting Started](docs/contributing/getting-started.md).

</details>

---

## 🤖 Which AI providers

Any OpenAI-compatible endpoint works. Aether **does not host or upload your API keys to Aether servers**; keys live only in the Obsidian plugin data directory (`data.json`) and are sent only to the provider you configure when Aether calls that provider.

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

> **Typical combo**: `embedding → SiliconFlow + bge-m3`, everything else → `DeepSeek + deepseek-chat`. Aether shows provider-reported token usage and supports monthly token warning thresholds; provider-reported usage parsing, recording, and restore normalize abnormal negative / fractional token counts to non-negative integers; actual cost depends on each provider's billing.

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
<tr><td>📦 <a href="docs/snapshots/2026-05-17-v0.1-complete.md">Phase Snapshot: v0.1 Complete</a></td><td>Historical v0.1 cross-section with decisions & trade-offs</td></tr>
<tr><td>🚀 <a href="docs/contributing/getting-started.md">Getting Started</a></td><td>60-second health check → install in Obsidian → dev loop</td></tr>
<tr><td>📘 <a href="docs/user-guide.md">User Guide</a></td><td>7 real scenarios + 9 common pitfalls</td></tr>
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
<tr><td>🚢 <a href="docs/contributing/release-checklist.md">Release checklist</a></td><td>Release verification, remote-push prep + first-time community-plugin submission</td></tr>
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
- **API keys**: Stored only in Obsidian's plugin data dir (obfuscated; not in a keychain because Obsidian mobile lacks one). Model calls send the key only to the provider you configured.
- **AI calls**: Your pasted text goes only to **the provider you configured**. Aether collects nothing and sends nothing to Aether servers; if the content includes private files, API keys, or passwords, prefer a local model or trusted self-hosted service.
- **Recent jobs / diagnostics**: `⌘P → View recent jobs` shows import / index refresh / rebuild failures first; job history rejects malformed or reversed timestamps on write and read, ignores non-finite numeric summaries, and normalizes negative / fractional count summaries to non-negative integers; `⌘P → Diagnostics export` produces a JSON report with **API keys automatically redacted** and non-JSON values normalized to JSON-safe values.

---

## 📄 License

MIT. See [LICENSE](LICENSE).

---

## 🙏 Acknowledgments

- [Obsidian](https://obsidian.md/) — the host we run inside
- [Orama](https://github.com/oramasearch/orama) — pure-JS hybrid search engine
- [gray-matter](https://github.com/jonschlinkert/gray-matter) — frontmatter parsing
- [ulid](https://github.com/ulid/javascript) — time-sortable global IDs
