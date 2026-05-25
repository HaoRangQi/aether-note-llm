# @aether/core internals

This doc is the _engineer's_ tour. For an outsider view see `overview.md`.

## Module boundaries

```
src/
├── types.ts                  ★ public types — only additive changes
├── errors.ts                 ★ AetherError + codes
│
├── host/
│   ├── adapter.ts            IHostAdapter (the seam)
│   └── in-memory.ts          test impl + fixture
│
├── ids.ts                    ULID + slugify
├── hash.ts                   SHA-256 (WebCrypto)
├── url-normalize.ts          dedup-safe URL canonicaliser
│
├── markdown/
│   ├── frontmatter.ts        gray-matter wrapper + tolerant fallback
│   └── chunker.ts            heading-aware splitter (max ~1600 chars)
│
├── provider/
│   ├── types.ts              Provider, ProviderFactory
│   ├── registry.ts           lazy instantiation, API key indirection
│   ├── retry.ts              backoff, retriable classification
│   ├── openai-compatible.ts  default OpenAI-compatible provider adapter + usage sanitation
│   └── mock-provider.ts      test fixture
│
├── index-store/
│   ├── orama-store.ts        hybrid search + chunk lifecycle
│   └── serialize.ts          PersistedIndex ⇄ store
│
├── search/
│   └── search-engine.ts      embed + hybrid + group + rank → SearchHit[]
│
├── connectors/
│   ├── connector.ts          SourceConnector interface
│   ├── markdown-connector.ts
│   ├── plain-text-connector.ts
│   ├── notion-zip-connector.ts
│   ├── bookmarks-json-connector.ts
│   ├── itab-connector.ts
│   └── url-list-connector.ts
│
├── import/
│   ├── inbox-store.ts        pending/approved/discarded/merged state
│   ├── duplicate-detector.ts vector-cosine duplicate probe
│   └── pipeline.ts           Connector → AI metadata/URL fast path → Inbox
│
├── roles/
│   ├── default-roles.ts      built-in AI roles
│   ├── render-prompt.ts      prompt variable diagnostics + rendering
│   ├── role-registry.ts      role lookup and editor-role filtering
│   └── run-role.ts           single AI execution entry by outputKind
│
├── ai/
│   ├── metadata.ts           inbox_metadata role wrapper
│   ├── rewrite.ts            rewrite role wrapper
│   ├── summarize.ts          summarize role wrapper
│   └── extract.ts            extract role wrapper
│
├── budget/
│   └── token-usage.ts        append-only + monthly aggregate + token count sanitation
│
├── persistence/
│   ├── migrate.ts            forward-only settings migration + numeric bounds / role params sanitation
│   └── settings-store.ts     IHostAdapter-backed K-V
│
├── app.ts                    AetherCore — wiring + use-case methods
└── index.ts                  barrel export (public API)
```

## Module rules

1. **No upward imports.** `app.ts` is the _only_ module that may import from every other.
2. **No `obsidian` import.** Anywhere. Ever.
3. **Types are forwards-compatible.** Add fields as optional; never remove or rename in a minor version.
4. **One file, one responsibility.** If a file exceeds ~400 lines, ask whether the responsibility is really one thing.
5. **Tests mirror src layout.** `tests/unit/<dir>/<file>.test.ts` for each source file.

## Adding a new feature

| Feature kind             | Where to put it                                                                                                                          |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| New AI capability        | Add an `AiRole` seed when it should be built in; add a thin `src/ai/<name>.ts` wrapper only when callers need a typed convenience method |
| New import source        | `src/connectors/<source>-connector.ts` + register in `app.ts`                                                                            |
| New provider SDK         | `src/provider/<sdk>-provider.ts` + ProviderFactory + register in `app.ts`                                                                |
| New persistence slot     | `src/persistence/<slot>-store.ts` + key constant                                                                                         |
| Anything calling outside | Goes through `IHostAdapter`. If a method doesn't exist, add it to the interface and InMemoryHostAdapter first.                           |
