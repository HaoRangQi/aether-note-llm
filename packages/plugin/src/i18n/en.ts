import type { Dict } from "./index.js";

export const en: Dict = {
  // ---- common ----
  "common.cancel": "Cancel",
  "common.save": "Save",
  "common.confirm": "Confirm",
  "common.discard": "Discard",
  "common.remove": "Remove",
  "common.refresh": "Refresh",
  "common.test": "Test",
  "common.loading": "Loading…",
  "common.none": "(none)",
  "common.copy": "Copy",
  "common.close": "Close",

  // ---- settings: section titles ----
  "settings.title": "Aether Note LLM",
  "settings.section.quickStart": "🚀 Quick Start",
  "settings.section.providers": "🔌 AI Providers",
  "settings.section.roles": "🎭 AI Roles",
  "settings.section.advanced": "⚙️ Advanced",

  // ---- Quick Start ----
  "settings.quickStart.intro": "First time? Pick a provider, paste a key, you're ready in 30 seconds.",
  "settings.quickStart.statusTitle": "Current status",
  "settings.quickStart.statusEmpty": "No AI provider configured yet. Add a preset below.",
  "settings.quickStart.statusOk": "{count} provider(s) configured. Manage them in 'AI Providers'.",
  "settings.quickStart.addPreset": "+ {name}",
  "settings.quickStart.providerAdded":
    "Added {name}. Open 'AI Providers' to set the API key and test connection.",
  "settings.quickStart.applyRecommended": "Apply recommended bindings",
  "settings.quickStart.applyRecommended.desc":
    "Bind all AI roles (summarize/rewrite/extract/inbox-metadata/embedding) to your providers automatically.",

  // ---- language ----
  "settings.language": "Interface language / 界面语言",
  "settings.language.desc": "Takes effect immediately.",
  "settings.language.zh": "简体中文",
  "settings.language.en": "English",

  // ---- providers ----
  "settings.providers.empty": "No AI service yet. Click 'Add provider' below to start.",
  "settings.providers.add": "Add provider",
  "settings.providers.name": "Display name",
  "settings.providers.name.desc":
    "Used to distinguish providers in role bindings. Give each instance a unique alias.",
  "settings.providers.name.placeholder": "e.g. DeepSeek-Work / Company internal LLM",
  "settings.providers.preset": "Provider",
  "settings.providers.preset.placeholder": "Pick a preset",
  "settings.providers.baseUrl": "Base URL",
  "settings.providers.baseUrl.preset": "Auto-filled: {url}",
  "settings.providers.baseUrl.custom": "Custom service requires manual entry",
  "settings.providers.apiKey": "API Key",
  "settings.providers.apiKey.unset": "(not set)",
  "settings.providers.apiKey.set": "set ●●●●",
  "settings.providers.editKey": "Edit key",
  "settings.providers.signup": "Get a key",
  "settings.providers.test": "Test connection",
  "settings.providers.testing": "Testing…",
  "settings.providers.test.ok": "OK — {count} models found",
  "settings.providers.test.fail": "Failed: {error}",
  "settings.providers.test.unknown": "unknown error",
  "settings.providers.refreshModels": "Refresh model list",
  "settings.providers.modelsCached": "{count} models cached",
  "settings.providers.modelsNotCached": "Not queried yet — click 'Test connection' to fetch.",

  // ---- legacy bindings strings still used by applyRecommended ----
  "settings.bindings.empty": "Add and configure a provider first.",
  "settings.bindings.applyRecommended": "Apply recommended bindings",
  "settings.bindings.applied": "Recommended bindings applied",
  "settings.bindings.model.pickProvider": "Pick a provider first",
  "settings.bindings.model.noModels": "No models — test connection first",
  "settings.bindings.model.placeholder": "Pick a model",

  // ---- roles ----
  "settings.roles.intro":
    "Each role defines an AI operation. Edit prompts, bind models, or add custom roles.",
  "settings.roles.add": "+ New custom role",
  "settings.roles.row.unbound": "no provider bound",
  "settings.roles.row.bound": "{provider} · {model}",
  "settings.roles.newName": "New role",

  // ---- role editor ----
  "role.editor.title.builtin": "Edit role: {name}",
  "role.editor.title.custom": "Custom role",
  "role.field.name": "Name",
  "role.field.icon": "Icon",
  "role.field.icon.desc": "lucide icon name (e.g. wand / file-text / list / sparkles)",
  "role.field.description": "Description",
  "role.field.outputKind": "Output kind",
  "role.field.outputKind.desc":
    "Decides how the result is parsed and displayed. Built-in roles are read-only.",
  "role.outputKind.text": "Plain text",
  "role.outputKind.list": "Bullet list",
  "role.outputKind.metadata": "Metadata JSON",
  "role.outputKind.embedding": "Embedding (no prompt)",
  "role.field.provider": "Provider",
  "role.field.model": "Model",
  "role.field.prompt": "Prompt template",
  "role.field.prompt.vars": "Click to insert variable:",
  "role.field.prompt.insertVar": "Click to insert at cursor",
  "role.field.advanced": "Advanced parameters",
  "role.field.temperature": "Temperature",
  "role.field.temperature.desc": "0 = very conservative, 1 = creative. Typical 0.2 ~ 0.6.",
  "role.field.maxTokens": "Max tokens",
  "role.field.maxTokens.desc": "Response length cap. Leave empty to use provider default.",
  "role.field.enabled": "Enabled",
  "role.field.showInEditor": "Show in editor menu",
  "role.field.showInEditor.desc": "If off, only callable from the command palette.",
  "role.action.reset": "Reset default prompt",
  "role.action.reset.done": "Reset to defaults (not saved)",
  "role.test.button": "▶ Test with current selection",
  "role.test.needBinding": "Bind a provider and model first",
  "role.test.needSelection": "Select some text in the editor first",
  "role.test.running": "Running…",
  "role.test.failed": "Failed: {error}",
  "role.test.sampleFallback":
    "This is a sample passage to test the AI role. It has a few sentences for the model to work with.",

  // ---- API key modal ----
  "modal.apiKey.title": "Set API Key",
  "modal.apiKey.field": "API Key",
  "modal.apiKey.desc": "Stored in plugin data locally. Treat your vault as containing the key.",

  // ---- import modal ----
  "modal.import.title": "Import to Aether",
  "modal.import.field": "Paste markdown / text",
  "modal.import.button": "Import",
  "modal.import.empty": "Please enter some text to import",
  "modal.import.failed": "Import failed: {error}",
  "modal.import.zero": "No items imported. Check console for details.",
  "modal.import.done": "Imported {count} item(s)",
  "modal.import.error": "Import error: {error}",

  // ---- AI result modal ----
  "modal.aiResult.title": "AI result",
  "modal.aiResult.original": "Original",
  "modal.aiResult.rewritten": "AI output",
  "modal.aiResult.replace": "Replace selection",

  // ---- diagnostics ----
  "modal.diagnostics.title": "Diagnostics",
  "modal.diagnostics.copy": "Copy to clipboard",
  "modal.diagnostics.copied": "Copied to clipboard",

  // ---- commands ----
  "cmd.openHub": "Open Aether Hub",
  "cmd.import": "Import…",
  "cmd.rebuild": "Rebuild index",
  "cmd.diagnostics": "Diagnostics export",
  "cmd.aiRolePrefix": "Aether AI · ",

  // ---- editor menu ----
  "menu.aiRolePrefix": "Aether AI · ",

  // ---- AI runtime ----
  "ai.selectFirst": "Select some text first",
  "ai.failed": "AI call failed: {error}",

  // ---- Hub ----
  "view.hub.name": "Aether Hub",
  "view.hub.searchPlaceholder": "Search notes, bookmarks…",
  "view.hub.filter.all": "All",
  "view.hub.filter.note": "Notes",
  "view.hub.filter.bookmark": "Bookmarks",
  "view.hub.import": "📥 Import",
  "view.hub.openFolder": "📁 Open Inbox folder",
  "view.hub.recent.title": "Recent",
  "view.hub.recent.empty": "Inbox folder is empty. Click 'Import' above to add something.",
  "view.hub.searching": "Searching…",
  "view.hub.noMatches": "No matches.",
  "view.hub.searchFailed": "Search failed: {error}",
  "view.hub.statusReady": "Ready",
  "view.hub.statusNoProvider": "No AI provider",
  "view.hub.statusIndexed": "{count} indexed",
  "view.hub.onboard.title": "Configure AI service first",
  "view.hub.onboard.desc": "Click below to open Settings and set it up in one screen.",
  "view.hub.onboard.button": "Configure →",
  "view.hub.time.justNow": "just now",
  "view.hub.time.minutes": "{n} min ago",
  "view.hub.time.hours": "{n} hr ago",
  "view.hub.time.days": "{n} d ago",
  "view.hub.time.months": "{n} mo ago",

  // ---- status bar ----
  "status.bar": "Aether · {indexed} indexed · {providers} provider(s)",

  // ---- ribbon ----
  "ribbon.hub": "Aether Hub",
};
