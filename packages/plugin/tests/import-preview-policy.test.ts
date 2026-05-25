import { describe, expect, it } from "vitest";
import {
  NEW_IMPORT_PREVIEW_POLICY,
  PENDING_IMPORT_PREVIEW_POLICY,
  shouldDiscardRemainingImportItemOnCancel,
  shouldDiscardUnselectedImportItem,
} from "../src/ui/import-preview-policy.js";

describe("import preview policy", () => {
  it("cleans up unselected and remaining items for a fresh import batch", () => {
    expect(NEW_IMPORT_PREVIEW_POLICY.discardOnClose).toBe(true);
    expect(shouldDiscardUnselectedImportItem(NEW_IMPORT_PREVIEW_POLICY)).toBe(true);
    expect(shouldDiscardRemainingImportItemOnCancel(NEW_IMPORT_PREVIEW_POLICY)).toBe(true);
  });

  it("keeps unselected pending items resumable from the pending imports entry", () => {
    expect(PENDING_IMPORT_PREVIEW_POLICY.discardOnClose).toBe(false);
    expect(shouldDiscardUnselectedImportItem(PENDING_IMPORT_PREVIEW_POLICY)).toBe(false);
    expect(shouldDiscardRemainingImportItemOnCancel(PENDING_IMPORT_PREVIEW_POLICY)).toBe(false);
  });
});
