import type { Feature, TokenUsage } from "../types.js";

export interface UsageEntry {
  date: string; // ISO yyyy-mm-dd
  providerId: string;
  feature: Feature;
  model: string;
  promptTokens: number;
  completionTokens: number;
}

export interface UsageSnapshot {
  monthTotal: { promptTokens: number; completionTokens: number };
  perFeature: Record<Feature, { promptTokens: number; completionTokens: number }>;
}

export class TokenUsageStore {
  private entries: UsageEntry[] = [];
  constructor(private readonly now: () => number = Date.now) {}

  record(args: { providerId: string; feature: Feature; model: string; usage: TokenUsage }): void {
    const d = new Date(this.now());
    const date = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    this.entries.push({
      date,
      providerId: args.providerId,
      feature: args.feature,
      model: args.model,
      promptTokens: normalizeTokenCount(args.usage.promptTokens),
      completionTokens: normalizeTokenCount(args.usage.completionTokens),
    });
  }

  snapshot(): UsageSnapshot {
    const d = new Date(this.now());
    const prefix = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const monthTotal = { promptTokens: 0, completionTokens: 0 };
    const perFeature: Record<string, { promptTokens: number; completionTokens: number }> = {};
    for (const e of this.entries) {
      if (!e.date.startsWith(prefix)) continue;
      monthTotal.promptTokens += e.promptTokens;
      monthTotal.completionTokens += e.completionTokens;
      const slot = perFeature[e.feature] ?? { promptTokens: 0, completionTokens: 0 };
      slot.promptTokens += e.promptTokens;
      slot.completionTokens += e.completionTokens;
      perFeature[e.feature] = slot;
    }
    return { monthTotal, perFeature: perFeature as UsageSnapshot["perFeature"] };
  }

  /** Returns true when month total exceeds warn threshold. */
  isOverBudget(monthlyWarn: number | null): boolean {
    if (monthlyWarn === null) return false;
    const { monthTotal } = this.snapshot();
    return monthTotal.promptTokens + monthTotal.completionTokens >= monthlyWarn;
  }

  /** Serialise entries for persistence. */
  toJSON(): UsageEntry[] {
    return [...this.entries];
  }
  fromJSON(entries: UsageEntry[]): void {
    this.entries = entries.flatMap((entry) => {
      const normalized = normalizeUsageEntry(entry);
      return normalized ? [normalized] : [];
    });
  }
}

function normalizeUsageEntry(value: unknown): UsageEntry | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (
    typeof v.date === "string" &&
    typeof v.providerId === "string" &&
    typeof v.feature === "string" &&
    typeof v.model === "string" &&
    typeof v.promptTokens === "number" &&
    Number.isFinite(v.promptTokens) &&
    typeof v.completionTokens === "number" &&
    Number.isFinite(v.completionTokens)
  ) {
    return {
      date: v.date,
      providerId: v.providerId,
      feature: v.feature as Feature,
      model: v.model,
      promptTokens: normalizeTokenCount(v.promptTokens),
      completionTokens: normalizeTokenCount(v.completionTokens),
    };
  }
  return null;
}

function normalizeTokenCount(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}
