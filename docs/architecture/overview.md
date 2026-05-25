# Architecture Overview

This document is the **canonical orientation** for new contributors. Read it
once; come back to it whenever you wonder "where does X belong?".

## Goals (v0.2)

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
User types → HubView debounces 300 ms
            → AetherCore.searchWithMeta(req)
              → RoleRegistry.resolve("embedding")
              → ProviderRegistry.getProvider(role.providerId)
              → Provider.embed(query)
              → OramaIndexStore.searchHybrid(text + vector)
            → HubView renders mode metadata + cards (highlight hits)
```

### Import

```
User pastes text in ImportModal
  → AetherCore.importSource(source)
    → SourceConnector.parse → AsyncIterable<RawCandidate>
    → For each: proposeMetadata (AI role=inbox_metadata)
                detectDuplicate (vector cosine ≥ 0.92)
                InboxStore.addItem (status=pending)
    → InboxStore.save() (persisted to plugin data)
  → ImportPreviewModal renders editable preview
  → User chooses create / merge / discard and clicks write selected
  → AetherCore.approveInboxItem(itemId) or mergeInboxItem(itemId, noteId)
    → Write markdown file or merge into target via host.writeFile
    → reindexNote (chunk + embed + insert)
    → InboxStore.updateStatus → maybeArchive
  → ImportResultModal shows written / merged / failed items
```

## Why Obsidian Plugin first?

We considered three forms: Tauri standalone, hybrid, and plugin. The project
shipped first as an Obsidian plugin because:

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
| AI roles + thin helpers      | `packages/core/src/roles/`, `packages/core/src/ai/`         |
| Settings schema + migration  | `packages/core/src/persistence/`                            |
| Façade wiring                | `packages/core/src/app.ts`                                  |
| Obsidian binding             | `packages/plugin/src/host-adapter.ts`                       |
| Obsidian UI                  | `packages/plugin/src/views/`, `packages/plugin/src/modals/` |
