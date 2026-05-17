import type { Dict } from "./index.js";

export const en: Dict = {
  // ---- Common ----
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

  // ---- Settings: sections ----
  "settings.title": "Aether Note LLM",
  "settings.section.general": "General",
  "settings.section.providers": "AI providers",
  "settings.section.bindings": "Feature bindings",
  "settings.section.advanced": "Advanced",

  // ---- Settings: general ----
  "settings.language": "Language / 界面语言",
  "settings.language.desc": "Takes effect immediately.",
  "settings.language.zh": "简体中文",
  "settings.language.en": "English",

  // ---- Settings: providers ----
  "settings.providers.empty": "No AI providers configured. Click \"Add provider\" below to start.",
  "settings.providers.add": "Add provider",
  "settings.providers.preset": "Provider",
  "settings.providers.preset.placeholder": "Pick a preset",
  "settings.providers.baseUrl": "Base URL",
  "settings.providers.baseUrl.preset": "Auto-filled: {url}",
  "settings.providers.baseUrl.custom": "Custom endpoint — fill manually",
  "settings.providers.apiKey": "API Key",
  "settings.providers.apiKey.unset": "(not set)",
  "settings.providers.apiKey.set": "Set ●●●●",
  "settings.providers.editKey": "Edit key",
  "settings.providers.signup": "Get key",
  "settings.providers.test": "Test connection",
  "settings.providers.testing": "Testing…",
  "settings.providers.test.ok": "Connected — {count} models found",
  "settings.providers.test.fail": "Failed: {error}",
  "settings.providers.test.unknown": "unknown error",
  "settings.providers.refreshModels": "Refresh models",
  "settings.providers.modelsCached": "{count} models cached",
  "settings.providers.modelsNotCached": "Models not yet fetched — click Test to load",

  // ---- Settings: feature bindings ----
  "settings.bindings.empty": "Add and configure a provider before binding features.",
  "settings.bindings.intro": "Pick a provider and model for each feature. Models come from live queries.",
  "settings.bindings.applyRecommended": "Apply recommended",
  "settings.bindings.applied": "Recommended bindings applied",
  "settings.bindings.feature": "Feature",
  "settings.bindings.provider": "Provider",
  "settings.bindings.model": "Model",
  "settings.bindings.model.pickProvider": "Pick a provider first",
  "settings.bindings.model.noModels": "No models — test connection first",
  "settings.bindings.model.placeholder": "Pick a model",

  // ---- Feature names ----
  "feature.chat": "Chat",
  "feature.chat.desc": "General chat. Not exposed in UI yet.",
  "feature.embedding": "Embedding (semantic search)",
  "feature.embedding.desc": "Encodes note chunks into vectors for semantic search. BAAI/bge-m3 recommended.",
  "feature.summarize": "AI summarize",
  "feature.summarize.desc": "Select text → command palette → \"AI summarize\".",
  "feature.rewrite": "AI rewrite",
  "feature.rewrite.desc": "Select text → command palette → \"AI rewrite\".",
  "feature.extract": "Extract key points",
  "feature.extract.desc": "Turn a paragraph into a bullet list of key points.",
  "feature.inbox_metadata": "Inbox metadata",
  "feature.inbox_metadata.desc": "On import, AI proposes title, tags, and summary.",

  // ---- Settings: advanced ----
  "settings.advanced.inboxFolder": "Inbox folder",
  "settings.advanced.inboxFolder.desc": "Imported notes land here for review before being approved into the vault.",
  "settings.advanced.scope": "Scan scope",
  "settings.advanced.scope.vault": "Entire vault",
  "settings.advanced.scope.inbox": "Aether Inbox only",
  "settings.advanced.alpha": "Search weight α",
  "settings.advanced.alpha.desc": "0 = pure vector (semantic), 1 = pure text (keywords). 0.4 is a sensible balance.",
  "settings.advanced.rebuild": "Rebuild index",
  "settings.advanced.rebuild.desc": "Re-scans the configured scope, rebuilds chunks + vectors. Required after changing the embedding model.",
  "settings.advanced.rebuild.button": "Rebuild now",
  "settings.advanced.rebuild.done": "Rebuilt: {indexed}/{scanned} files",

  // ---- API key modal ----
  "modal.apiKey.title": "Set API key",
  "modal.apiKey.field": "API key",
  "modal.apiKey.desc": "Stored locally in plugin data. Treat your vault as containing this secret.",

  // ---- Import modal ----
  "modal.import.title": "Import to Aether Inbox",
  "modal.import.field": "Paste markdown / text",
  "modal.import.button": "Import",
  "modal.import.empty": "Please enter some text to import",
  "modal.import.failed": "Import failed: {error}",
  "modal.import.zero": "No items imported. Check console for details.",
  "modal.import.done": "Imported {count} item(s) to Inbox. Review and approve in Inbox view.",
  "modal.import.error": "Import error: {error}",

  // ---- AI result modal ----
  "modal.aiResult.title": "AI result",
  "modal.aiResult.original": "Original",
  "modal.aiResult.rewritten": "AI output",
  "modal.aiResult.replace": "Replace selection",

  // ---- Diagnostics modal ----
  "modal.diagnostics.title": "Diagnostics",
  "modal.diagnostics.copy": "Copy to clipboard",
  "modal.diagnostics.copied": "Copied to clipboard",

  // ---- Commands ----
  "cmd.openSearch": "Open Search",
  "cmd.openInbox": "Open Inbox",
  "cmd.import": "Import…",
  "cmd.rebuild": "Rebuild index",
  "cmd.diagnostics": "Diagnostics export",
  "cmd.aiRewrite": "AI: Rewrite selection",
  "cmd.aiSummarize": "AI: Summarize selection",
  "cmd.aiExtract": "AI: Extract key points",

  // ---- Editor menu ----
  "menu.aiRewrite": "Aether: AI rewrite",
  "menu.aiSummarize": "Aether: AI summarize",
  "menu.aiExtract": "Aether: Extract key points",

  // ---- AI runtime ----
  "ai.selectFirst": "Select some text first",
  "ai.failed": "AI failed: {error}",

  // ---- Search view ----
  "view.search.name": "Aether Search",
  "view.search.placeholder": "Search your knowledge base…",
  "view.search.searching": "Searching…",
  "view.search.noMatches": "No matches.",
  "view.search.failed": "Search failed: {error}",

  // ---- Inbox view ----
  "view.inbox.name": "Aether Inbox",
  "view.inbox.empty": "Inbox is empty.",
  "view.inbox.intro": "Approved items will be saved to your Inbox folder.",
  "view.inbox.dupWarning": "Possible duplicate of an existing note.",
  "view.inbox.approve": "Approve",
  "view.inbox.discard": "Discard",
  "view.inbox.approved": "Approved",
  "view.inbox.approveFailed": "Approve failed: {error}",

  // ---- Status bar ----
  "status.inbox": "Aether: Inbox {count}",

  // ---- Ribbon ----
  "ribbon.search": "Aether search",
};
