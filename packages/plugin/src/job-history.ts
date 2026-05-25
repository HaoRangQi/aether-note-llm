import type AetherPlugin from "./main.js";
import { redactSensitiveText } from "./redaction.js";

export type JobHistoryKind = "import-write" | "rebuild" | "index-refresh";
export type JobHistoryStatus = "done" | "failed" | "cancelled";

export interface JobHistoryEntry {
  id: string;
  kind: JobHistoryKind;
  title: string;
  status: JobHistoryStatus;
  startedAt: number;
  finishedAt: number;
  summary: Record<string, string | number | boolean | null>;
  failures: Array<{ path?: string; title?: string; message: string }>;
}

const DATA_KEY = "jobHistory";
const MAX_HISTORY = 20;
const MAX_FAILURES_PER_JOB = 10;
const MAX_TEXT_LENGTH = 500;

export async function appendJobHistory(
  plugin: AetherPlugin,
  entry: Omit<JobHistoryEntry, "id">,
): Promise<void> {
  const timestamps = normalizeTimestampRange(entry.startedAt, entry.finishedAt);
  if (!timestamps) {
    console.warn("[Aether JobHistory] Skipped job history with invalid timestamps.");
    return;
  }

  try {
    await plugin.dataStore.update((data) => {
      const history = readJobHistory(data);
      history.unshift({
        id: `${entry.kind}-${entry.finishedAt}-${Math.random().toString(36).slice(2, 8)}`,
        ...entry,
        ...timestamps,
        title: clampText(entry.title),
        summary: normalizeSummary(entry.summary) ?? {},
        failures: normalizeFailures(entry.failures) ?? [],
      });
      data[DATA_KEY] = history.slice(0, MAX_HISTORY);
    });
  } catch (e) {
    console.warn("[Aether JobHistory] Failed to append job history:", e);
  }
}

export async function listJobHistory(plugin: AetherPlugin): Promise<JobHistoryEntry[]> {
  try {
    return await plugin.dataStore.read((data) => readJobHistory(data));
  } catch (e) {
    console.warn("[Aether JobHistory] Failed to read job history:", e);
    return [];
  }
}

function readJobHistory(data: Record<string, unknown>): JobHistoryEntry[] {
  const raw = data[DATA_KEY];
  if (!Array.isArray(raw)) return [];
  return raw
    .map(normalizeJobHistoryEntry)
    .filter((entry): entry is JobHistoryEntry => entry !== null)
    .slice(0, MAX_HISTORY);
}

function normalizeJobHistoryEntry(value: unknown): JobHistoryEntry | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const timestamps = normalizeTimestampRange(v.startedAt, v.finishedAt);
  const summary = normalizeSummary(v.summary);
  const failures = normalizeFailures(v.failures);
  if (
    typeof v.id !== "string" ||
    (v.kind !== "import-write" && v.kind !== "rebuild" && v.kind !== "index-refresh") ||
    typeof v.title !== "string" ||
    (v.status !== "done" && v.status !== "failed" && v.status !== "cancelled") ||
    !timestamps ||
    !summary ||
    !failures
  ) {
    return null;
  }
  return {
    id: v.id,
    kind: v.kind,
    title: clampText(v.title),
    status: v.status,
    ...timestamps,
    summary,
    failures,
  };
}

function normalizeSummary(value: unknown): JobHistoryEntry["summary"] | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const summary: JobHistoryEntry["summary"] = {};
  for (const [key, raw] of Object.entries(value)) {
    const safeKey = clampText(key);
    if (raw === null || typeof raw === "boolean") {
      summary[safeKey] = raw;
    } else if (isFiniteNumber(raw)) {
      summary[safeKey] = normalizeSummaryNumber(raw);
    } else if (typeof raw === "string") {
      summary[safeKey] = clampText(raw);
    }
  }
  return summary;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeSummaryNumber(value: number): number {
  return value > 0 ? Math.floor(value) : 0;
}

function normalizeTimestampRange(
  startedAt: unknown,
  finishedAt: unknown,
): Pick<JobHistoryEntry, "startedAt" | "finishedAt"> | null {
  if (!isFiniteNumber(startedAt) || !isFiniteNumber(finishedAt) || finishedAt < startedAt) {
    return null;
  }
  return { startedAt, finishedAt };
}

function normalizeFailures(value: unknown): JobHistoryEntry["failures"] | null {
  if (!Array.isArray(value)) return null;
  const failures: JobHistoryEntry["failures"] = [];
  for (const raw of value.slice(0, MAX_FAILURES_PER_JOB)) {
    if (!raw || typeof raw !== "object") continue;
    const f = raw as Record<string, unknown>;
    if (typeof f.message !== "string") continue;
    failures.push({
      ...(typeof f.path === "string" ? { path: clampText(f.path) } : {}),
      ...(typeof f.title === "string" ? { title: clampText(f.title) } : {}),
      message: clampText(f.message),
    });
  }
  return failures;
}

function clampText(value: string): string {
  const redacted = redactSensitiveText(value);
  return redacted.length <= MAX_TEXT_LENGTH ? redacted : `${redacted.slice(0, MAX_TEXT_LENGTH)}...`;
}
