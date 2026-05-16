# Release checklist

For every release (including `v0.1.0`):

1. **Update CHANGELOG.md.**
   - Move `[Unreleased]` items into a new `[X.Y.Z] - YYYY-MM-DD` section.
2. **Bump versions.**
   - `package.json` (root)
   - `packages/core/package.json`
   - `packages/plugin/package.json`
   - `packages/plugin/manifest.json`
   - Append `"X.Y.Z": "<minObsidianVersion>"` to `packages/plugin/versions.json`.
3. **Verify.**
   - `pnpm clean && pnpm install`
   - `pnpm typecheck`
   - `pnpm test`
   - `pnpm build`
4. **Manual smoke test** in a real vault (see `docs/testing/strategy.md` §Manual smoke).
5. **Commit.**
   - `chore(release): vX.Y.Z` covering version bumps + CHANGELOG.
6. **Tag.**
   - `git tag -a vX.Y.Z -m "vX.Y.Z"`
   - `git push origin main --tags`
7. **GitHub release.**
   - Upload `packages/plugin/main.js`, `packages/plugin/manifest.json`, `packages/plugin/styles.css` as release assets (Obsidian community plugins fetch these by file name from a release).
   - Paste the CHANGELOG section as the release notes.
8. **Submit / update community plugin listing** (only the very first release for `0.1.0`).
   - Open PR against `obsidianmd/obsidian-releases` with manifest entry.

## First-time community plugin submission

Done once, before the very first `0.1.0` GitHub release is published publicly:

1. Confirm the plugin `id` (`aether-note-llm`) is not taken — check `obsidianmd/obsidian-releases` and the listing at <https://obsidian.md/plugins>.
2. Confirm `manifest.json` includes: `id`, `name`, `version`, `minAppVersion`, `description`, `author`, `authorUrl`, `isDesktopOnly`.
3. Add an entry to `community-plugins.json` in `obsidianmd/obsidian-releases` following alphabetical order:

   ```json
   {
     "id": "aether-note-llm",
     "name": "Aether Note LLM",
     "author": "Aether Authors",
     "description": "Personal knowledge base assistant with hybrid AI search and smart import inbox.",
     "repo": "<github-user>/aether-note-llm"
   }
   ```

4. Open a PR. Be prepared to address reviewer feedback within a week.
5. Once merged, your plugin appears in the official directory; future releases just need a new GitHub release with `main.js`, `manifest.json`, `styles.css` as assets — no further PR needed.
