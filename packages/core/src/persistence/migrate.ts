import type { PersistedSettings } from "../types.js";

export const SETTINGS_LATEST_VERSION = 1 as const;

export function migrateSettings(raw: unknown): PersistedSettings {
  const obj = (raw ?? {}) as Partial<PersistedSettings> & { schemaVersion?: number };
  if (!obj.schemaVersion || obj.schemaVersion === 1) {
    return {
      schemaVersion: 1,
      providers: Array.isArray(obj.providers) ? obj.providers : [],
      bindings: Array.isArray(obj.bindings) ? obj.bindings : [],
      apiKeys:
        typeof obj.apiKeys === "object" && obj.apiKeys !== null
          ? (obj.apiKeys as Record<string, string>)
          : {},
      ui: {
        alpha: typeof obj.ui?.alpha === "number" ? obj.ui.alpha : 0.4,
        aetherInboxFolder:
          typeof obj.ui?.aetherInboxFolder === "string" ? obj.ui.aetherInboxFolder : "Aether Inbox",
        scanScope: obj.ui?.scanScope === "aether-inbox-only" ? "aether-inbox-only" : "vault",
      },
      budgets: {
        monthlyTokenWarn:
          typeof obj.budgets?.monthlyTokenWarn === "number" ? obj.budgets.monthlyTokenWarn : null,
      },
      flags: {
        aiTrace: Boolean(obj.flags?.aiTrace),
      },
    };
  }
  throw new Error(`Unknown settings schemaVersion: ${obj.schemaVersion}`);
}
