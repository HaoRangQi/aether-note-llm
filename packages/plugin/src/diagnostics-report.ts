import { isSensitiveDiagnosticKey, redactSensitiveText } from "./redaction.js";

export interface DiagnosticsReportArgs {
  pluginVersion: string;
  obsidianApi: string;
  indexCount: number;
  chunkCount: number;
  pendingInbox: number;
  recentJobs: unknown;
  settings: unknown;
  usage: unknown;
}

export function createDiagnosticsReport(args: DiagnosticsReportArgs): Record<string, unknown> {
  return redactDiagnosticsValue({
    pluginVersion: args.pluginVersion,
    obsidianApi: args.obsidianApi,
    indexCount: args.indexCount,
    chunkCount: args.chunkCount,
    pendingInbox: args.pendingInbox,
    recentJobs: args.recentJobs,
    settings: args.settings,
    usage: args.usage,
  }) as Record<string, unknown>;
}

export function redactDiagnosticsValue(value: unknown): unknown {
  return redactDiagnosticsValueInner(value, new WeakSet<object>());
}

function redactDiagnosticsValueInner(value: unknown, seen: WeakSet<object>): unknown {
  if (value === undefined) return null;
  if (typeof value === "bigint" || typeof value === "function" || typeof value === "symbol") {
    return null;
  }
  if (typeof value === "string") return redactString(value);
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);

  if (Array.isArray(value)) {
    const out = value.map((item) => redactDiagnosticsValueInner(item, seen));
    seen.delete(value);
    return out;
  }

  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (key === "apiKeys" && raw && typeof raw === "object" && !Array.isArray(raw)) {
      out[key] = Object.fromEntries(
        Object.keys(raw).map((k) => [redactSensitiveText(k), "<redacted>"]),
      );
      continue;
    }
    const safeKey = redactSensitiveText(key);
    if (isSensitiveDiagnosticKey(key)) {
      out[safeKey] = "<redacted>";
      continue;
    }
    out[safeKey] = redactDiagnosticsValueInner(raw, seen);
  }
  seen.delete(value);
  return out;
}

function redactString(value: string): string {
  return redactSensitiveText(value);
}
