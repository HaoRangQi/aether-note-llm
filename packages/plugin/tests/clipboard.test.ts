import { beforeEach, describe, expect, it, vi } from "vitest";

const { copyToClipboard } = await import("../src/ui/clipboard.js");

describe("copyToClipboard", () => {
  const notify = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("writes text and shows the success notice", async () => {
    const clipboard = { writeText: vi.fn().mockResolvedValue(undefined) };

    await expect(
      copyToClipboard("hello", { successMessage: "Copied", clipboard, notify }),
    ).resolves.toBe(true);

    expect(clipboard.writeText).toHaveBeenCalledWith("hello");
    expect(notify).toHaveBeenCalledWith("Copied", 2000);
  });

  it("shows a failure notice when the clipboard write is rejected", async () => {
    const clipboard = { writeText: vi.fn().mockRejectedValue(new Error("denied")) };

    await expect(
      copyToClipboard("hello", {
        successMessage: "Copied",
        failureMessage: "Cannot copy",
        clipboard,
        notify,
      }),
    ).resolves.toBe(false);

    expect(clipboard.writeText).toHaveBeenCalledWith("hello");
    expect(notify).toHaveBeenCalledWith("Cannot copy", 5000);
  });

  it("shows a failure notice when clipboard access is unavailable", async () => {
    await expect(
      copyToClipboard("hello", {
        successMessage: "Copied",
        failureMessage: "Cannot copy",
        clipboard: null,
        notify,
      }),
    ).resolves.toBe(false);

    expect(notify).toHaveBeenCalledWith("Cannot copy", 5000);
  });
});
