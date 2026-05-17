# Changelog

All notable changes to Aether Note LLM are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed

- **Import 功能错误处理**: 修复导入失败时无错误提示的问题
  - `ImportModal` 现在捕获并显示所有导入错误
  - `ImportPipeline` 增加完整的异常处理，单个项目失败不影响批次
  - `proposeMetadata` 失败时使用 fallback，不再中断导入流程
  - 区分"导入 0 项"和"导入失败"，提供明确的用户反馈
  - 在控制台输出详细错误日志，便于调试
- 改进重复检测的错误处理，embedding 不可用时优雅降级

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
