# Test strategy

We test at three levels. Each level answers a different question.

## Levels

```
┌──────────────────────────────────────┐
│ Manual smoke checklist (in Obsidian)  │  ← Did the user-visible feature ship?
├──────────────────────────────────────┤
│ Integration tests (vitest, in core)   │  ← Did the flows wire up correctly?
├──────────────────────────────────────┤
│ Unit tests (vitest, in core)          │  ← Does this function do what it says?
└──────────────────────────────────────┘
```

We do NOT use a browser-driver E2E suite for v0.1. Obsidian E2E tooling is
immature; the cost outweighs the value at this stage.

## Unit tests

- Location: `packages/core/tests/unit/`, mirroring `src/`.
- Runner: `vitest`.
- One `*.test.ts` per source file.
- Use `MockProvider` for AI, `InMemoryHostAdapter` for filesystem.
- Coverage thresholds (enforced in CI): lines / funcs / statements ≥ 65%, branches ≥ 55%.
  Goal is to raise to 70 / 60 in v0.2 once orama internals are easier to stub. Adjustment ticket should accompany the bump.

Run:

```bash
pnpm --filter @aether/core test
pnpm --filter @aether/core test:coverage
```

## Integration tests

- Location: `packages/core/tests/integration/`.
- Exercise `AetherCore` through its public methods (`importSource`,
  `approveInboxItem`, `search`, `rebuildAll`).
- Mock providers; never hit network.
- Each test seeds a fresh `InMemoryHostAdapter` and `AetherCore`.

## Plugin tests

- Location: `packages/plugin/tests/`.
- We do not run Obsidian itself in CI. Instead we keep these tests small —
  smoke tests that the plugin code imports core utilities correctly and that
  the bundle builds. UI behaviour is manually verified.

## Manual smoke checklist

Run before every release. Use a clean test vault.

1. **Install** the plugin (see `docs/contributing/development-setup.md`).
2. **First run** — confirm the ribbon icon appears and the status bar shows `Aether: Inbox 0`.
3. **Provider setup**
   - Add a Provider with a real OpenAI-compatible endpoint (DeepSeek or local Ollama suffices).
   - Click `Test`. Expect green notice with model count.
   - Bind `embedding`, `inbox_metadata`, `rewrite`, `summarize`, `extract` features.
4. **Import**
   - Command palette → `Aether: Import...`. Paste a few paragraphs.
   - Expect Inbox view to populate; titles + tags + summary set by AI.
5. **Approve**
   - Approve one Inbox item.
   - Verify a markdown file appears under `Aether Inbox/notes/<yyyy>/<mm>/`.
   - Open it: frontmatter contains `aether_*` fields.
6. **Search**
   - Open Search view (`Aether: Open Search` or ribbon).
   - Type a query that should match the imported text.
   - Expect a card; click it; expect the file to open in editor.
7. **AI helpers**
   - Select a paragraph in any note. Right-click → `Aether: AI summarize`.
   - Expect a result modal; click `Replace selection`; expect editor updated.
8. **Bookmark import**
   - Command palette → `Aether: Import...`. Paste a Chrome `Bookmarks` JSON file content.
   - Expect bookmark cards in Inbox; approve one; verify generated file kind=bookmark.
9. **Search a bookmark**
   - Search for the bookmark title; click; default browser should open the URL.
10. **Rebuild**
    - Settings → `Rebuild`. Confirm notice with file count.
11. **Diagnostics**
    - Command palette → `Aether: Diagnostics export`. Confirm modal opens with redacted keys.

## Adding new tests

- New function ⇒ new unit test in the matching file.
- New cross-module flow ⇒ new integration test.
- New user-visible feature ⇒ add to the manual smoke checklist.
- Failing bug report ⇒ regression test BEFORE the fix.
