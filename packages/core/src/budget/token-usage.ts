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

  record(args: {
    providerId: string;
    feature: Feature;
    model: string;
    usage: TokenUsage;
  }): void {
    const d = new Date(this.now());
    const date = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    this.entries.push({
      date,
      providerId: args.providerId,
      feature: args.feature,
      model: args.model,
      promptTokens: args.usage.promptTokens,
      completionTokens: args.usage.completionTokens,
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
    this.entries = [...entries];
  }
}
