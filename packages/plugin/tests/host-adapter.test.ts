/**
 * Lightweight smoke test verifying the plugin can import @aether/core utilities.
 * Full integration is tested manually in Obsidian (see docs/testing/strategy.md).
 */
import { describe, expect, it } from "vitest";
import { newUlid } from "@aether/core";

describe("plugin smoke", () => {
  it("can import @aether/core utilities", () => {
    expect(newUlid()).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });
});
