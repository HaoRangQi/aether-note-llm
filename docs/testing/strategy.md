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

We do not currently use a browser-driver E2E suite. Obsidian E2E tooling is
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
  browser / Obsidian-dependent UI still builds. Pure plugin UI helpers, such
  as clipboard fallback handling, external signup link fallback handling, and
  the exclusive index job guard, get direct Vitest coverage because they are
  user-visible failure paths.
- Modal copy-failure regressions use `packages/plugin/vitest.config.ts` to
  alias `obsidian` to `packages/plugin/tests/fixtures/obsidian.ts`. This lets
  diagnostics, recent jobs, and usage modals be rendered in Vitest and proves a
  failed clipboard write shows a notice without closing the modal or dropping
  visible JSON / job / usage content. Diagnostics modal coverage also verifies
  the rendered JSON and successful clipboard payload include recent jobs and the
  current usage snapshot, so the command-palette export is wired to the same job
  history and usage stores users inspect elsewhere, and that diagnostics export
  stays available with `recentJobs: []` when the job history store cannot be read. Diagnostics report coverage
  also normalizes non-finite numbers, unsupported JSON values, and circular
  references before export, rather than relying on `JSON.stringify` to coerce
  or reject them implicitly. The same coverage verifies
  editor rewrite result copy failures keep both the original selection and AI
  output visible, successful rewrite-result copy writes only the AI output, and
  applying a rewrite result passes the AI output to the replacement callback before closing the modal, while discarding closes without calling the replacement callback. It also verifies the
  recent-jobs successful JSON copy payload includes status, count summary, and
  failure details, locks the recent-jobs empty state so the JSON copy action
  stays disabled and its handler remains a no-op for both no-history and history-store-read-failure states,
  verifies failed recent jobs render status, elapsed time, count summary, and failure details together, and
  verifies cancelled recent jobs render their status and count summary without
  inventing a failure section. Job history persistence coverage also rejects
  non-finite or reversed timestamps at append time, rejects malformed persisted
  records with non-finite or reversed timestamp ranges, drops non-finite
  numeric summary values, redacts URL query / fragment / hash-route secrets and
  header-style secrets including `Proxy-Authorization: ...`, `Cookie: ...`, and
  `Set-Cookie: ...`, plus key-value `proxy-authorization=...`, `cookie=...`,
  and `set-cookie=...` before recent jobs persist and again when legacy
  persisted jobs are read, and normalizes negative / fractional summary numbers
  before they can reach recent-jobs or diagnostics JSON.
  Usage modal coverage verifies the
  successful JSON copy payload includes the configured budget and per-feature
  usage snapshot, locks the usage empty state so first-run vaults still show
  zero-token metrics and copy a JSON payload with zero `monthTotal` values plus an empty `perFeature`
  object, normalizes non-finite, negative, and fractional usage numbers at the OpenAI-compatible provider
  boundary, the core usage store boundary, and again before rendering or copying JSON, normalizes
  invalid settings numbers such as search weight alpha, budget thresholds, and AI Role provider params
  (`temperature` in the OpenAI-compatible `0..2` range, `maxTokens`) during settings migration while preserving
  custom prompt variable params. Runtime AI Role coverage verifies override
  params are normalized before chat calls as the last boundary before provider
  adapters. Usage coverage also sends invalid budgets back to the
  budget-unset path in the modal, floors fractional budget thresholds before
  rendering or copying usage JSON,
  verifies the budget-unset hint remains visible and copies `budget: null`, and
  verifies the monthly token warning threshold is surfaced when
  provider-reported usage reaches the configured budget.
- Tracked index-job regressions render the same Obsidian activity / Notice
  doubles and cover refresh cancellation, rebuild result cancellation, rebuild
  abort cancellation, refresh hard failures, refresh partial failures, rebuild
  hard failures, refresh follow-up UI refresh failure, rebuild partial failures,
  and rebuild follow-up UI refresh failure. These tests prove recent jobs keep
  the core task status (`cancelled`, `done`, or `failed`) separate from
  post-task UI refresh errors.
- Pending import cancellation is covered through the real pending-entry modal
  path: cancelling during a resumed pending write records a cancelled import
  job, keeps already approved items approved, and leaves unprocessed pending
  items resumable instead of discarding them. The same result-modal path verifies
  failed `Open` actions on written notes show a Notice while keeping the import
  result list visible.
- Hub answer cancellation is covered at the `HubView` level: if the user clicks
  Cancel and the provider still resolves later, the stale answer is discarded
  and the panel stays in the cancelled state. The same coverage verifies missing
  answer Role bindings and provider failures show guidance/errors without
  exposing copy/source actions, answer empty states do not expose copy or source
  actions, whitespace-only provider answers are treated as empty, successful answer copy includes the answer text, source indexes,
  vault paths, heading paths, URLs, and evidence excerpts, copy failures report a Notice without dropping the answer text,
  citations, or context-token status, truncated-context warnings remain visible
  when answer sources are budget-limited, and citation-quality warnings surface
  missing citation references or uncited answers before users trust or copy an
  answer. Answer source buttons are also covered so note citations open through
  Obsidian and bookmark citations open through the host adapter; external-open
  and vault-note-open failures show a Notice without dropping the rendered
  answer or source evidence. Hub result navigation uses the same vault-open
  guard: recent-import cards and note search results surface open failures as
  Notices while keeping the current recent/search list visible.
- Activity indicator regressions cover the shared floating task UI used by AI
  roles, import writes, refresh, and rebuild: progress metadata updates keep the
  elapsed timer, cancel callbacks are idempotent, multiple active indicators can
  coexist with stack positioning, and remaining indicators are re-stacked after
  one hides.
- Editor AI Role command regressions cover command-palette guardrails: without
  an editor selection the direct role commands and `Run current AI role…` both
  show a selection notice without calling the provider, opening the role picker,
  or opening a rewrite modal; the role picker reads and filters the latest role
  list when opened, choosing a live role revalidates the latest role list before
  calling the provider and opening the rewrite result modal, stale picker
  suggestions and previously registered roles that are no longer runnable report
  an unavailable-role notice without calling the provider, and after cancellation
  a late provider result does not open a rewrite modal or replace the editor
  selection.
- Current full baseline: 399 tests = core 255 + plugin 144.

## Manual smoke checklist

Run before every release. Use a clean test vault. The full UAT script lives in
`docs/testing/uat-checklist.md`; this section is the short release smoke.

1. **Install** the plugin (see `docs/contributing/development-setup.md`).
2. **First run** — confirm the ribbon icon opens Hub and the status bar shows indexed count + provider count.
3. **Quick Start**
   - Add a chat Provider, set API key, and click `Test`.
   - Confirm Provider cards have a visible expand/collapse icon and newly added Providers open automatically.
   - Confirm AI Providers and the expanded new Provider form both show the risk notice for private files, API keys, passwords, and preferring local or trusted self-hosted models.
   - Confirm each Provider card exposes `Trusted for private content`; only trusted Providers can be selected for private role bindings and used by private routes.
   - In `Advanced`, configure `Privacy Routing` folders (`Private folders`, `Private import folder`), then configure public/private model bindings per role in `AI Roles`.
   - Add or select an embedding-capable Provider when available.
   - Apply bindings and confirm AI Roles have Provider / Model values for `inbox_metadata`, `answer`, editor roles, and `embedding`.
4. **Import preview**
   - Command palette → `Import…`. Paste text or a URL list.
   - Confirm import target defaults to `Private import` on first use, then remembers the last selected target.
   - Confirm the private target is visually marked as a red warning state.
   - Switch to `Public import` and confirm explicit risk confirmation is required before continuing.
   - Confirm the preview list appears, edit one title/tag/summary/category, then write selected items.
   - Verify public target writes into `Aether Inbox/<category>/<yyyy>/<mm>/...`; private target writes into `Aether Private Inbox/<category>/<yyyy>/<mm>/...`, and generated frontmatter includes `aether_category` plus `aether_category_label`.
   - Switch to `Import folder`, choose a folder containing markdown files, then confirm background progress appears, keeps running alongside other activity cards, and final status/failures are recorded in recent jobs.
   - In Settings → Advanced, confirm import categories are grouped in one collapsible card and can be added/restored.
   - Run `Organize imported notes…`, generate a preview for `Aether Inbox`, and confirm no files move until selected preview rows are applied.
5. **Pending import retry**
   - Force or simulate a write failure if practical.
   - Confirm failed write items remain pending and can be reopened from Hub or `Review pending imports`.
6. **Search and answer**
   - Open Hub (`Open Aether Hub` or ribbon), search for imported content, and click a note result.
   - Confirm the search box shows the privacy warning about private notes, API keys, passwords, and preferring local models.
   - Confirm Hub `Public / Private / All` scope switch forwards correctly to search and answer.
   - Run `Answer` from current results; confirm citations map to existing sources.
   - For private scope without private/trusted route, confirm search falls back to BM25 and private answer generation is blocked with actionable guidance.
   - Copy the answer with sources; if clipboard access is denied or unavailable, confirm a failure notice appears and the answer remains visible.
   - If embedding is unavailable, confirm search falls back to BM25 with a visible reason.
7. **Editor AI Roles**
   - Select a paragraph in a note.
   - Run an enabled AI Role from the right-click menu or `Run current AI role…`.
   - Confirm the result modal can copy output, report clipboard failures, replace the selection, and undo works.
8. **Maintenance**
   - Run `Refresh index changes`, then `Rebuild index`; confirm unified job progress and recent jobs update.
   - Open recent jobs and this month's usage; confirm recent-jobs JSON contains status / summary / failures, and usage JSON contains budget / usage data, or reports clipboard failure without closing the modal.
9. **Diagnostics**
   - Command palette → `Diagnostics export`.
   - Confirm the JSON includes recent jobs and usage, and that API keys, Authorization headers, free-text `Authorization: ...`, `Proxy-Authorization: ...`, `Cookie: ...`, `Set-Cookie: ...`, `proxy-authorization=...`, `cookie=...`, and `set-cookie=...` values, URL userinfo credentials, sensitive URL query / fragment / hash-route params (`api_key`, `token`, `access-token`, `refresh-token`, `id_token`, `client_secret`, custom `*token` / `*secret` names), sensitive header-style failure text, and token-like failure text are redacted.
   - Copy diagnostics JSON; confirm the clipboard payload includes recent jobs and usage, or if clipboard access is denied or unavailable, confirm the modal shows a failure notice and keeps the JSON visible.

## Adding new tests

- New function ⇒ new unit test in the matching file.
- New cross-module flow ⇒ new integration test.
- New user-visible feature ⇒ add to the manual smoke checklist.
- Failing bug report ⇒ regression test BEFORE the fix.
