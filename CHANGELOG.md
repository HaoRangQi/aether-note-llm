# Changelog

All notable changes to Aether Note LLM are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-05-16

### Added

- Obsidian Plugin v0.1 (`aether-note-llm`).
- `@aether/core` host-agnostic core package with:
  - Multi-provider OpenAI-compatible AI client + per-feature bindings.
  - Hybrid BM25 + vector search powered by `@orama/orama`.
  - Import pipeline: markdown / paste / Notion ZIP / Chrome bookmarks JSON / URL list.
  - AI-assisted Inbox metadata, duplicate detection, approve / merge / discard flow.
  - Paragraph-level rewrite / summarize / extract.
  - Persistent settings, token-usage tracking, index rebuild.
- Diagnostics export, status bar inbox counter, command palette commands.
