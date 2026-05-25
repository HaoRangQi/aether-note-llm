import { describe, expect, it } from "vitest";
import { TokenUsageStore } from "../../../src/budget/token-usage.js";

describe("TokenUsageStore", () => {
  it("aggregates within the current month", () => {
    const fixed = Date.UTC(2026, 4, 16, 0, 0, 0); // 2026-05-16 UTC
    const s = new TokenUsageStore(() => fixed);
    s.record({
      providerId: "p",
      feature: "chat",
      model: "m",
      usage: { promptTokens: 10, completionTokens: 5 },
    });
    s.record({
      providerId: "p",
      feature: "chat",
      model: "m",
      usage: { promptTokens: 3, completionTokens: 2 },
    });
    const snap = s.snapshot();
    expect(snap.monthTotal).toEqual({ promptTokens: 13, completionTokens: 7 });
    expect(snap.perFeature.chat).toEqual({ promptTokens: 13, completionTokens: 7 });
  });

  it("ignores entries from prior months", () => {
    const store = new TokenUsageStore(() => Date.UTC(2026, 4, 16));
    store.record({
      providerId: "p",
      feature: "chat",
      model: "m",
      usage: { promptTokens: 10, completionTokens: 0 },
    });
    // simulate that current time advanced into next month
    const newStore = new TokenUsageStore(() => Date.UTC(2026, 5, 1));
    newStore.fromJSON(store.toJSON());
    const snap = newStore.snapshot();
    expect(snap.monthTotal.promptTokens).toBe(0);
  });

  it("isOverBudget returns false when threshold null", () => {
    const s = new TokenUsageStore(() => Date.UTC(2026, 4, 16));
    s.record({
      providerId: "p",
      feature: "chat",
      model: "m",
      usage: { promptTokens: 1_000_000, completionTokens: 0 },
    });
    expect(s.isOverBudget(null)).toBe(false);
  });

  it("isOverBudget triggers at threshold", () => {
    const s = new TokenUsageStore(() => Date.UTC(2026, 4, 16));
    s.record({
      providerId: "p",
      feature: "chat",
      model: "m",
      usage: { promptTokens: 600, completionTokens: 400 },
    });
    expect(s.isOverBudget(1000)).toBe(true);
    expect(s.isOverBudget(2000)).toBe(false);
  });

  it("normalizes recorded and restored token counts to non-negative integers", () => {
    const fixed = Date.UTC(2026, 4, 16);
    const recorded = new TokenUsageStore(() => fixed);
    recorded.record({
      providerId: "p",
      feature: "answer",
      model: "m",
      usage: { promptTokens: -3, completionTokens: 8.9 },
    });
    expect(recorded.snapshot()).toEqual({
      monthTotal: { promptTokens: 0, completionTokens: 8 },
      perFeature: {
        answer: { promptTokens: 0, completionTokens: 8 },
      },
    });

    const restored = new TokenUsageStore(() => fixed);
    restored.fromJSON([
      {
        date: "2026-05-16",
        providerId: "p",
        feature: "chat",
        model: "m",
        promptTokens: 5.7,
        completionTokens: -2,
      },
    ]);
    expect(restored.snapshot()).toEqual({
      monthTotal: { promptTokens: 5, completionTokens: 0 },
      perFeature: {
        chat: { promptTokens: 5, completionTokens: 0 },
      },
    });
  });

  it("toJSON / fromJSON round-trip", () => {
    const a = new TokenUsageStore(() => Date.UTC(2026, 4, 16));
    a.record({
      providerId: "p",
      feature: "embedding",
      model: "m",
      usage: { promptTokens: 1, completionTokens: 0 },
    });
    const b = new TokenUsageStore(() => Date.UTC(2026, 4, 16));
    b.fromJSON(a.toJSON());
    expect(b.snapshot()).toEqual(a.snapshot());
  });
});
