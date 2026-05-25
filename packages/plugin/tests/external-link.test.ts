import { describe, expect, it, vi } from "vitest";
import { openExternalLink } from "../src/ui/external-link.js";

describe("openExternalLink", () => {
  it("opens safe web URLs in a new tab", () => {
    const opener = vi.fn(() => ({}));
    const notify = vi.fn();

    expect(
      openExternalLink("https://example.com/signup", {
        opener,
        notify,
        failureMessage: (error) => `Cannot open: ${error}`,
      }),
    ).toBe(true);

    expect(opener).toHaveBeenCalledWith(
      "https://example.com/signup",
      "_blank",
      "noopener,noreferrer",
    );
    expect(notify).not.toHaveBeenCalled();
  });

  it("shows a failure notice when the browser blocks the popup", () => {
    const opener = vi.fn(() => null);
    const notify = vi.fn();

    expect(
      openExternalLink("https://example.com/signup", {
        opener,
        notify,
        failureMessage: (error) => `Cannot open: ${error}`,
      }),
    ).toBe(false);

    expect(opener).toHaveBeenCalledWith(
      "https://example.com/signup",
      "_blank",
      "noopener,noreferrer",
    );
    expect(notify).toHaveBeenCalledWith("Cannot open: popup blocked", 5000);
  });

  it("shows a failure notice when opening throws", () => {
    const opener = vi.fn(() => {
      throw new Error("browser denied");
    });
    const notify = vi.fn();

    expect(
      openExternalLink("https://example.com/signup", {
        opener,
        notify,
        failureMessage: (error) => `Cannot open: ${error}`,
      }),
    ).toBe(false);

    expect(notify).toHaveBeenCalledWith("Cannot open: browser denied", 5000);
  });

  it("rejects non-web URLs before opening", () => {
    const opener = vi.fn();
    const notify = vi.fn();

    expect(
      openExternalLink("javascript:alert(1)", {
        opener,
        notify,
        failureMessage: (error) => `Cannot open: ${error}`,
      }),
    ).toBe(false);

    expect(opener).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith("Cannot open: External URL must use http or https", 5000);
  });
});
