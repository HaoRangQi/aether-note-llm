/**
 * Lightweight smoke test verifying the plugin can import @aether/core utilities.
 * Full integration is tested manually in Obsidian (see docs/testing/strategy.md).
 */
import { describe, expect, it } from "vitest";
import { newUlid } from "@aether/core";
import {
  joinVaultFolderPath,
  normalizeExternalWebUrl,
  normalizeVaultFolderPath,
} from "../src/ui/vault-path.js";

describe("plugin smoke", () => {
  it("can import @aether/core utilities", () => {
    expect(newUlid()).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it("normalizes safe vault-relative folder paths", () => {
    expect(normalizeVaultFolderPath(" Aether Inbox//notes/ ")).toBe("Aether Inbox/notes");
    expect(joinVaultFolderPath("/vault/root/", "Aether Inbox")).toBe("/vault/root/Aether Inbox");
  });

  it("rejects folder paths outside the vault", () => {
    expect(() => normalizeVaultFolderPath("../Secrets")).toThrow("cannot contain '..'");
    expect(() => normalizeVaultFolderPath("/tmp")).toThrow("relative to the vault");
    expect(() => normalizeVaultFolderPath("C:\\Users\\me")).toThrow("relative to the vault");
  });

  it("allows only http and https external URLs", () => {
    expect(normalizeExternalWebUrl("https://example.com/path")).toBe("https://example.com/path");
    expect(normalizeExternalWebUrl("http://example.com")).toBe("http://example.com/");
    expect(() => normalizeExternalWebUrl("javascript:alert(1)")).toThrow("http or https");
    expect(() => normalizeExternalWebUrl("file:///tmp/x")).toThrow("http or https");
    expect(() => normalizeExternalWebUrl("not a url")).toThrow("invalid");
  });
});
