# Architecture Overview

This document is the **canonical orientation** for new contributors. Read it
once; come back to it whenever you wonder "where does X belong?".

## Goals (v0.1)

- Be useful inside Obsidian on day one — no separate server, no native deps.
- Make every side effect plug-replaceable via `IHostAdapter`.
- Keep markdown files the source of truth so users can leave anytime.
- Never block on AI: search degrades to BM25 when no provider is configured.

## Three-layer architecture

```
┌──────────────────────────────────────────────────────────┐
│  Obsidian (host)                                          │
│  Vault API · Editor (CodeMirror 6) · Workspace · Modals  │
└────────────────────────┬─────────────────────────────────┘
                         │ Plugin API
┌────────────────────────▼─────────────────────────────────┐
│  aether-note-llm  (this repo's packages/plugin)          │
│  ObsidianHostAdapter · Views · Commands · Settings UI    │
└────────────────────────┬─────────────────────────────────┘
                         │ ES-module import
┌────────────────────────▼─────────────────────────────────┐
│  @aether/core  (this repo's packages/core)               │
│  AetherCore · ImportPipeline · SearchEngine ·            │
│  ProviderRegistry · IndexStore · InboxStore · Settings   │
└──────────────────────────────────────────────────────────┘
```

**Plugin → core dependency is one-way.** Core never imports `obsidian`.

## Data flow examples

### Search

```
User types → SearchView debounces 300 ms
            → AetherCore.search(req)
              → ProviderRegistry.resolve("embedding")
              → Provider.embed(query)
              → OramaIndexStore.searchHybrid(text + vector)
            → SearchView renders cards (highlight hits)
```

### Import

```
User pastes text in ImportModal
  → AetherCore.importSource(source)
    → SourceConnector.parse → AsyncIterable<RawCandidate>
    → For each: proposeMetadata (AI feature=inbox_metadata)
                detectDuplicate (vector cosine ≥ 0.92)
                InboxStore.addItem (status=pending)
    → InboxStore.save() (persisted to plugin data)
  → InboxView re-renders on next layout-change
  → User clicks Approve
  → AetherCore.approveInboxItem(itemId)
    → Write markdown file via host.writeFile
    → reindexNote (chunk + embed + insert)
    → InboxStore.updateStatus → maybeArchive
```

## Why Obsidian Plugin first?

We considered three forms: Tauri standalone, hybrid, and plugin. v0.1 ships as
a plugin because:

- **Editor reuse.** Obsidian already provides best-in-class markdown editing.
- **Time to value.** A plugin ships in weeks; a standalone app in months.
- **Zero-lock-in.** All data is plain markdown.

A standalone Tauri app is a future direction. Because business logic lives in
`@aether/core` and side effects live behind `IHostAdapter`, that migration is
"write a new HostAdapter" — no business logic changes.

## Where things live

| Concern                      | Location                                                    |
| ---------------------------- | ----------------------------------------------------------- |
| Markdown parsing / chunking  | `packages/core/src/markdown/`                               |
| AI providers, retry, mocks   | `packages/core/src/provider/`                               |
| Hybrid index (orama wrapper) | `packages/core/src/index-store/`                            |
| Import sources               | `packages/core/src/connectors/`                             |
| Inbox state machine          | `packages/core/src/import/`                                 |
| Per-feature AI helpers       | `packages/core/src/ai/`                                     |
| Settings schema + migration  | `packages/core/src/persistence/`                            |
| Façade wiring                | `packages/core/src/app.ts`                                  |
| Obsidian binding             | `packages/plugin/src/host-adapter.ts`                       |
| Obsidian UI                  | `packages/plugin/src/views/`, `packages/plugin/src/modals/` |
