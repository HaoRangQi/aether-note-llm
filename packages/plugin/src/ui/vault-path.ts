export function normalizeVaultFolderPath(vaultPath: string): string {
  const normalized = vaultPath.trim().replace(/\\/g, "/").replace(/\/+/g, "/").replace(/\/+$/, "");
  if (!normalized) throw new Error("Folder path is empty");
  if (normalized.startsWith("/") || normalized.startsWith("\\") || /^[A-Za-z]:/.test(normalized)) {
    throw new Error("Folder path must be relative to the vault");
  }
  if (normalized.split("/").some((segment) => segment === "..")) {
    throw new Error("Folder path cannot contain '..'");
  }
  return normalized;
}

export function joinVaultFolderPath(vaultRoot: string, vaultPath: string): string {
  const root = vaultRoot.replace(/\/+$/, "");
  const relative = normalizeVaultFolderPath(vaultPath);
  return `${root}/${relative}`;
}

export function normalizeExternalWebUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("External URL is invalid");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("External URL must use http or https");
  }
  return parsed.toString();
}
