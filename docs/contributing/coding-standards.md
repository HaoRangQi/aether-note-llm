# Coding standards

These rules keep the codebase navigable years from now.

## TypeScript

- `strict: true` in `tsconfig.base.json`. No `// @ts-ignore` without an inline reason.
- Prefer `interface` for object shapes, `type` for unions / intersections / mapped types.
- Always export types alongside values from the barrel `index.ts`.
- No `any`. Use `unknown` + narrowing.
- Functions that throw must throw `AetherError` with a typed `code`.

## Architecture

- **Core never imports `obsidian`.** Side effects pass through `IHostAdapter`.
- **One responsibility per file.** Files >400 lines need a second look.
- **No upward imports.** `app.ts` is the only module that imports from every other.
- **Plugin layer is thin.** Translate between Obsidian and core; no business logic.

## Testing

- TDD: write a failing test, then make it pass.
- Unit tests under `tests/unit/`, mirroring `src/`.
- Integration tests under `tests/integration/`, exercising `AetherCore`.
- Use `MockProvider` for AI; `InMemoryHostAdapter` for filesystem.
- Coverage thresholds enforced in CI: lines/functions/statements ≥ 65%, branches ≥ 55%.
  Goal is to raise to 70 / 60 in v0.2.

## Commits

- Chinese commit messages, format: `type(scope): 描述`.
  - Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`.
  - Scope: `core`, `plugin`, `docs`, `repo`.
- One logical change per commit. Tests + impl + docs of the same change belong together.
- Never amend a commit that has been pushed.

## Style

- Prettier handles formatting (`pnpm format`). No bikeshedding.
- 2-space indent, double-quoted strings, trailing commas.
- Line length 100. Long arg lists wrap one-per-line.

## What NOT to do

- Don't add features the plan/spec didn't ask for. Open an issue first.
- Don't suppress errors with empty `catch {}` unless the surrounding code documents why.
- Don't break the `IHostAdapter` interface in a minor version.
- Don't change frontmatter schema without bumping `schemaVersion` and writing a migration.
