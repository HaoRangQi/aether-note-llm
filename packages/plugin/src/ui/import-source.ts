import type { ImportSource } from "@aether/core";

export const IMPORT_FILE_ACCEPT = ".md,.markdown,.txt,.url,.itabdata,.json";

export function buildImportSourceFromPaste(text: string, label: string): ImportSource {
  const urls = parseUrlList(text);
  if (urls.length > 0) {
    return { kind: "paste", label, payload: { type: "url-list", urls } };
  }
  return { kind: "paste", label, payload: { type: "paste-text", text } };
}

export function buildImportSourceFromFile(raw: string, fileName: string): ImportSource | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".itabdata")) {
    return { kind: "file", label: fileName, payload: { type: "itab-data", raw } };
  }
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) {
    return {
      kind: "file",
      label: fileName,
      payload: { type: "markdown-file", path: fileName, content: raw },
    };
  }
  if (lower.endsWith(".txt") || lower.endsWith(".url")) {
    const urls = parseUrlList(raw);
    if (urls.length > 0) {
      return { kind: "file", label: fileName, payload: { type: "url-list", urls } };
    }
    if (lower.endsWith(".txt")) {
      return {
        kind: "file",
        label: fileName,
        payload: { type: "markdown-file", path: fileName, content: raw },
      };
    }
    return null;
  }
  if (lower.endsWith(".json")) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (Array.isArray(parsed.navConfig)) {
        return { kind: "file", label: fileName, payload: { type: "itab-data", raw } };
      }
      if (parsed.roots) {
        return { kind: "file", label: fileName, payload: { type: "bookmarks-json", raw } };
      }
    } catch {
      return null;
    }
  }
  return null;
}

export function parseUrlList(raw: string): string[] {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return lines.some(isSupportedWebUrl) ? lines : [];
}

function isSupportedWebUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
