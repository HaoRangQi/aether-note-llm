import { slugify } from "../ids.js";
import type { IHostAdapter } from "../host/adapter.js";
import type { ImportCategory } from "../types.js";
import { categoryPathSegment, findImportCategory } from "./categories.js";

export interface ImportVaultPathArgs {
  rootFolder: string;
  itemId: string;
  title: string;
  categoryId: string;
  categories: ImportCategory[];
  now: number;
  host: Pick<IHostAdapter, "exists">;
  preserveFileName?: string;
}

export async function buildUniqueImportVaultPath(args: ImportVaultPathArgs): Promise<string> {
  const folder = args.rootFolder.replace(/\/+$/, "");
  const d = new Date(args.now);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const category = findImportCategory(args.categories, args.categoryId);
  const categoryFolder = categoryPathSegment(category);
  const baseName = args.preserveFileName
    ? stripMarkdownExtension(args.preserveFileName)
    : `${args.itemId.slice(0, 10)}-${slugify(args.title).slice(0, 40) || "untitled"}`;
  return buildUniquePath({
    host: args.host,
    dir: `${folder}/${categoryFolder}/${year}/${month}`,
    baseName,
  });
}

export async function buildUniqueOrganizedVaultPath(args: {
  rootFolder: string;
  currentPath: string;
  categoryId: string;
  categories: ImportCategory[];
  host: Pick<IHostAdapter, "exists">;
}): Promise<string> {
  const folder = args.rootFolder.replace(/\/+$/, "");
  const category = findImportCategory(args.categories, args.categoryId);
  const categoryFolder = categoryPathSegment(category);
  const { year, month } = extractPathMonth(args.currentPath) ?? currentUtcMonth();
  const fileName = args.currentPath.split("/").pop() ?? "untitled.md";
  const baseName = stripMarkdownExtension(fileName);
  return buildUniquePath({
    host: args.host,
    dir: `${folder}/${categoryFolder}/${year}/${month}`,
    baseName,
    currentPath: args.currentPath,
  });
}

export function extractPathMonth(vaultPath: string): { year: string; month: string } | null {
  const parts = vaultPath.split("/");
  for (let i = 0; i < parts.length - 1; i++) {
    const year = parts[i];
    const month = parts[i + 1];
    if (/^\d{4}$/.test(year ?? "") && /^(0[1-9]|1[0-2])$/.test(month ?? "")) {
      return { year: year!, month: month! };
    }
  }
  return null;
}

export function monthInRange(
  vaultPath: string,
  fromMonth: string | null | undefined,
  toMonth: string | null | undefined,
): boolean {
  if (!fromMonth && !toMonth) return true;
  const parsed = extractPathMonth(vaultPath);
  if (!parsed) return false;
  const value = `${parsed.year}/${parsed.month}`;
  if (fromMonth && value < fromMonth) return false;
  if (toMonth && value > toMonth) return false;
  return true;
}

export function normalizeMonthFilter(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return /^\d{4}\/(0[1-9]|1[0-2])$/.test(trimmed) ? trimmed : null;
}

async function buildUniquePath(args: {
  host: Pick<IHostAdapter, "exists">;
  dir: string;
  baseName: string;
  currentPath?: string;
}): Promise<string> {
  const cleanBaseName = sanitizeFileStem(args.baseName);
  let n = 1;
  while (true) {
    const suffix = n === 1 ? "" : `-${n}`;
    const candidate = `${args.dir}/${cleanBaseName}${suffix}.md`;
    if (candidate === args.currentPath || !(await args.host.exists(candidate))) return candidate;
    n += 1;
  }
}

function sanitizeFileStem(value: string): string {
  const normalized = value
    .trim()
    .replace(/\\/g, "-")
    .replace(/\//g, "-")
    .replace(/[:*?"<>|#^[\]]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return normalized || "untitled";
}

function stripMarkdownExtension(value: string): string {
  return value.replace(/\.md$/i, "");
}

function currentUtcMonth(): { year: string; month: string } {
  const d = new Date();
  return {
    year: String(d.getUTCFullYear()),
    month: String(d.getUTCMonth() + 1).padStart(2, "0"),
  };
}
