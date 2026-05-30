# Obsidian plugin internals

## Plugin lifecycle

```
onload()
 ├── new PluginDataStore(this)
 ├── new ObsidianHostAdapter(app, dataStore)
 ├── new AetherCore(adapter)
 ├── await core.init()
 │     ├── store.init()
 │     ├── settings.load()
 │     ├── applySettings(settings)
 │     ├── inbox.load()
 │     ├── loadIndex()
 │     └── loadUsage()
 ├── registerView(HUB_VIEW_TYPE)
 ├── addSettingTab(AetherSettingsTab)
 ├── addRibbonIcon(...)
 ├── addStatusBarItem(...)
 ├── registerCommands(this)
 └── onLayoutReady(openHubOnFirstInstall)
```

`onunload()` calls `core.saveIndex()` and lets Obsidian dispose registered views.

## ObsidianHostAdapter notes

- **Why `requestUrl` instead of `fetch`.** Obsidian's `fetch` is sandboxed by CORS; `requestUrl` is the official escape hatch. The adapter wraps it in a `Response`-shaped object so core never knows.
- **Why `PluginDataStore` for plugin data.** Plugin data persists in `.obsidian/plugins/<id>/data.json` and is preserved across plugin reinstalls. Obsidian exposes this as one JSON object, so all plugin-side mutations go through `PluginDataStore` to serialize `loadData()` / `saveData()` cycles and avoid concurrent writes overwriting unrelated keys.
- **`openInEditor`** delegates to `workspace.openLinkText`.

## View lifecycle

`HubView` is the only daily `ItemView`. It replaces the old Search / Inbox
split: search, solve mode, recent imports, pending import entry, recent jobs,
usage, and index refresh live in one surface. It re-renders imperatively (no
virtual DOM) because Obsidian's API is DOM-direct. Pattern:

```typescript
async onOpen() { this.render(); }
private render() {
  const root = this.containerEl.children[1] as HTMLElement;
  root.empty();
  // ... build DOM ...
}
```

Import review is modal-based, not a separate view. `ImportModal` creates
pending `InboxItem`s, `ImportPreviewModal` lets the user edit and choose
create / merge / discard, and `ImportResultModal` reports written / merged /
failed items. Failed write items remain pending and are reopened from Hub or
the `Review pending imports` command. Fresh import batches may discard
unprocessed items when cancelled, while the pending-entry policy keeps
unprocessed pending items resumable and records the write as a cancelled recent
job. Result-list `Open` actions use a guarded vault opener so Obsidian failures
show a Notice without closing the import result modal or hiding written/merged
rows.
Import target is explicit (`public` / `private`): first use defaults to private,
then remembers the last user choice. Switching to public import requires a risk
confirmation. Approval writes to different folders (`Aether Inbox` vs `Aether
Private Inbox`) and forwards target metadata into core privacy routing.

Problem solving is a Hub mode, not a replacement for search. It calls
`core.solveProblem`, renders the structured solution sections with citations,
and uses `ExperienceCardModal` for the user-confirmed save step. Experience-card
target preview mirrors core privacy rules: public scope goes to the public
experience folder, private scope goes to the private folder, and all scope with
no citations defaults private.

Old `open-search` and `open-inbox` command IDs are kept as compatibility
aliases, but both open Hub.

## Settings tab patching

`AetherSettingsTab` always works on a _deep clone_ of the current settings,
mutates it, then saves the whole snapshot. This keeps the diff explicit and
makes saving/loading commutative.
Privacy settings live in the same snapshot (`settings.privacy`): private folder
prefixes and private inbox folder. Public/private model bindings are configured
per AI role, while provider-level trusted toggle controls whether a provider is
allowed to access private-folder content.

## Plugin data queue

`PluginDataStore` is the only plugin-side module that calls Obsidian
`loadData()` / `saveData()` directly. Core persistence (`settings.json`,
`inbox.json`, `index.json`, `usage.json`) reaches it through
`ObsidianHostAdapter`; plugin UI persistence (`jobHistory`) reaches the same
queue directly. This keeps long-running import, index refresh, and rebuild jobs
from losing each other's updates.

## Long-running job guard

`JobTracker` owns the Obsidian-facing task indicator, notices, cancellation
signal, and recent-job writes. Index maintenance also goes through
`createExclusiveIndexJobRunner` in `src/ui/index-job-guard.ts`, which keeps
`Refresh index changes` and `Rebuild index` mutually exclusive across Settings,
Hub, and rebuild prompts. Duplicate triggers reuse the in-flight promise,
display the already-running notice for the active job kind, and call the
current button's `onAlreadyRunning` callback immediately so the UI does not stay
disabled while the original task continues.

## Obsidian UI test seam

Plugin unit tests do not boot Obsidian. `packages/plugin/vitest.config.ts`
aliases `obsidian` to `tests/fixtures/obsidian.ts`, a narrow DOM / Modal /
Notice / Setting test double. Modal tests use it to render diagnostics, recent
jobs, usage panels, and rewrite-result panels and assert clipboard failures
leave the modal open with the JSON, job rows, usage metrics, original
selection, and AI output still visible. Diagnostics modal coverage also asserts
that both the rendered export and successful clipboard payload include recent
jobs and the current usage snapshot, tying the command-palette JSON to the same
stores as the recent-jobs and usage panels, while history-store read failures
fall back to `recentJobs: []` so diagnostics export stays usable. Diagnostics report generation also
normalizes non-finite numbers, unsupported JSON values, circular references, and
common sensitive query parameter spellings such as `api_key`, `token`,
`access-token`, `refresh-token`, `id_token`, and `client_secret`, custom
`*token` / `*secret` query, fragment, and hash-route params, URL userinfo
credentials, plus header-style failure text such as `Authorization: ...`,
`Proxy-Authorization: ...`, `Cookie: ...`, `Set-Cookie: ...`, `X-Api-Key: ...`,
`auth-token: ...`, or `secret: ...`, plus key-value cookie / proxy forms such
as `cookie=...`, `set-cookie=...`, and `proxy-authorization=...`, before
clipboard export.
Rewrite-result apply coverage
verifies successful copy writes only the AI output and that the AI output is handed to the replacement callback before the modal
closes, while discard closes without invoking replacement; recent-jobs successful JSON copy is covered so status, count summary,
and failure details stay in the exported payload, recent-jobs empty state is
also covered so JSON copy stays disabled and its click handler no-ops for both no-history and
history-store-read-failure states, failed recent jobs are covered so status, elapsed time, count summary, and failure details render
together, and cancelled recent jobs are covered so their status and count
summary render without an empty failure section. Job history persistence
normalizes job records before UI rendering and persistence: text is redacted
for URL query, fragment, hash-route, Bearer, key-value, and header-style secrets
including `Proxy-Authorization: ...`, `Cookie: ...`, `Set-Cookie: ...`,
`proxy-authorization=...`, `cookie=...`, and `set-cookie=...` on both append
and read, text is clamped, history and failure counts are capped, malformed entries are
dropped, and reversed timestamps plus non-finite timestamps or numeric summary
values are rejected before they reach recent-jobs or diagnostics JSON. Usage empty state coverage
keeps zero-token first-run vaults explicit and verifies JSON copy exports zero
`monthTotal` values with an empty `perFeature` object, the successful JSON copy
path is covered so budget and per-feature usage stay in the exported payload,
non-finite usage counts are normalized before rendering or copying JSON, invalid budget thresholds are normalized back to the budget-unset
path by core settings migration and again before usage JSON copy, explicitly unset budgets copy as `budget: null`, fractional
budget thresholds are floored before rendering or copying, and monthly token
warning coverage verifies valid budget thresholds render as a visible usage warning. Activity indicator
and JobTracker tests use the same double for
the floating task surface and Notice surface, so progress metadata updates,
idempotent cancellation, single-active indicator replacement, rebuild result
cancellation, rebuild abort cancellation, refresh hard failures, rebuild hard
failures, refresh partial failures, rebuild partial failures, and post-task UI
refresh failures can be
verified without starting Obsidian.
Command tests use the same double to verify editor AI Role guardrails: missing
editor selections stop direct Role commands and `Run current AI role…` before
provider calls, role picker creation, or rewrite modals; the role picker reads
and filters the latest role list when opened, choosing a live role revalidates
the latest role list before calling the provider and opening the rewrite result
modal, stale picker suggestions and stale registered roles stop with an
unavailable-role notice, and cancelled requests cannot open stale rewrite modals
or replace the editor selection after a late provider response.
Hub answer tests
use the same view double to verify cancelled answer requests cannot render stale
provider results after the user has already returned the panel to a cancelled
state, and that answer copy failures keep the rendered answer, context usage,
truncation warnings, and citation evidence intact. Successful answer copy is also
covered so the clipboard payload includes the answer text, source indexes, vault
paths, heading paths, URLs, and evidence excerpts. Citation-quality warnings are
also rendered at the Hub view seam so uncited answers and missing answer
references stay visible before the user copies or trusts a generated answer.
The same seam locks missing-answer-role, provider-failure, and empty-answer
states, including whitespace-only provider answers, so copy and source actions are not shown when no answer can be generated.
Answer source buttons are verified at the same seam: note citations delegate to
`workspace.openLinkText`, while bookmark citations delegate to the host
adapter's external URL opener.
External-open and vault-note-open failures surface as Notices without clearing
the rendered answer or citation evidence. Recent-import cards and note search
results also route through the guarded vault opener, so Obsidian open failures
show a Notice without clearing the current Hub list.
Problem-solver tests use the same seam to verify the mode switch calls
`solveProblem`, renders structured sections, opens the editable experience-card
modal, forwards edited draft fields to core, and previews private storage for
all-scope solutions without citations.
