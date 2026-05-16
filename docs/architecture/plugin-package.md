# Obsidian plugin internals

## Plugin lifecycle

```
onload()
 ├── new ObsidianHostAdapter(app, this)
 ├── new AetherCore(adapter)
 ├── await core.init()
 │     ├── store.init()
 │     ├── settings.load()
 │     ├── applySettings(settings)
 │     ├── inbox.load()
 │     └── loadIndex()
 ├── registerView(SEARCH_VIEW_TYPE)
 ├── registerView(INBOX_VIEW_TYPE)
 ├── addSettingTab(AetherSettingsTab)
 ├── addRibbonIcon(...)
 ├── addStatusBarItem(...)
 └── registerCommands(this)
```

`onunload()` calls `core.saveIndex()` and lets Obsidian dispose registered views.

## ObsidianHostAdapter notes

- **Why `requestUrl` instead of `fetch`.** Obsidian's `fetch` is sandboxed by CORS; `requestUrl` is the official escape hatch. The adapter wraps it in a `Response`-shaped object so core never knows.
- **Why `loadData()/saveData()` for plugin data.** Plugin data persists in `.obsidian/plugins/<id>/data.json` and is preserved across plugin reinstalls.
- **`openInEditor`** delegates to `workspace.openLinkText`.

## View lifecycle

`SearchView` and `InboxView` extend `ItemView`. Both re-render imperatively
(no virtual DOM) because Obsidian's API is DOM-direct. Pattern:

```typescript
async onOpen() { this.render(); }
private render() {
  const root = this.containerEl.children[1] as HTMLElement;
  root.empty();
  // ... build DOM ...
}
```

For events that should re-render (Inbox status changes, layout shifts) we
register on `workspace` events.

## Settings tab patching

`AetherSettingsTab` always works on a _deep clone_ of the current settings,
mutates it, then saves the whole snapshot. This keeps the diff explicit and
makes saving/loading commutative.
