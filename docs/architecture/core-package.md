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
│   ├── registry.ts           lazy instantiation, key/binding indirection
│   ├── retry.ts              backoff, retriable classification
│   ├── openai-compatible.ts  the only concrete provider in v0.1
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
│   └── url-list-connector.ts
│
├── import/
│   ├── inbox-store.ts        pending/approved/discarded/merged state
│   ├── duplicate-detector.ts vector-cosine duplicate probe
│   └── pipeline.ts           Connector → AI metadata → Inbox
│
├── ai/
│   ├── metadata.ts           inbox_metadata feature (JSON-parsing tolerant)
│   ├── rewrite.ts            rewrite feature + shared runFeature
│   ├── summarize.ts          summarize feature
│   └── extract.ts            extract feature (bullet parsing)
│
├── budget/
│   └── token-usage.ts        append-only + monthly aggregate
│
├── persistence/
│   ├── migrate.ts            forward-only settings migration
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

| Feature kind             | Where to put it                                                                                                |
| ------------------------ | -------------------------------------------------------------------------------------------------------------- |
| New AI capability        | `src/ai/<feature>.ts` + a `Feature` union member                                                               |
| New import source        | `src/connectors/<source>-connector.ts` + register in `app.ts`                                                  |
| New provider SDK         | `src/provider/<sdk>-provider.ts` + ProviderFactory + register in `app.ts`                                      |
| New persistence slot     | `src/persistence/<slot>-store.ts` + key constant                                                               |
| Anything calling outside | Goes through `IHostAdapter`. If a method doesn't exist, add it to the interface and InMemoryHostAdapter first. |
