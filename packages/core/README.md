# @aether/core

Host-agnostic business core for Aether Note LLM. Used by the Obsidian plugin in
this repo; future hosts (a standalone Tauri desktop app, headless CLI, etc.) will
plug in by implementing `IHostAdapter`.

## Public API

Import everything from the package root:

```typescript
import { AetherCore, InMemoryHostAdapter } from "@aether/core";
```

Key exports:

- `AetherCore` — façade. One instance per vault.
- `IHostAdapter` / `InMemoryHostAdapter` — the only seam between core and the world.
- `ProviderRegistry`, `OpenAICompatibleProvider`, `MockProvider`.
- `SearchEngine`, `OramaIndexStore`.
- `ImportPipeline`, `InboxStore`, source connectors.
- `proposeMetadata`, `rewriteSelection`, `summarizeSelection`, `extractKeyPoints`.
- All domain types from `types.ts` (Note, Chunk, InboxItem, Provider, SearchHit, …).

## Stability contract

- Types in `types.ts` and the barrel `index.ts` are the public surface.
- Additive changes (new optional fields / new union members) are SemVer minor.
- Breaking changes require a major bump and a migration note in CHANGELOG.

## Testing

```bash
pnpm --filter @aether/core test
pnpm --filter @aether/core test:coverage
```

Unit tests live in `tests/unit/` mirroring `src/`. Integration tests live in
`tests/integration/` and exercise `AetherCore` end-to-end with `InMemoryHostAdapter`
and `MockProvider`.

See `docs/architecture/core-package.md` for module boundaries and `docs/testing/strategy.md`
for the test approach.
