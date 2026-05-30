import { slugify } from "../ids.js";
import type { ImportCategory } from "../types.js";

export const OTHER_CATEGORY_ID = "other";

export const DEFAULT_IMPORT_CATEGORIES: ImportCategory[] = [
  {
    id: "tutorial",
    label: "教程",
    folderName: "教程",
    keywords: ["教程", "guide", "tutorial", "how-to"],
  },
  {
    id: "ai-prompts",
    label: "AI 提示词",
    folderName: "AI 提示词",
    keywords: ["prompt", "prompts", "提示词", "ai"],
  },
  {
    id: "life",
    label: "生活",
    folderName: "生活",
    keywords: ["生活", "life", "health", "travel"],
  },
  {
    id: "history",
    label: "历史",
    folderName: "历史",
    keywords: ["历史", "history"],
  },
  {
    id: "work",
    label: "工作",
    folderName: "工作",
    keywords: ["工作", "work", "career", "meeting"],
  },
  {
    id: OTHER_CATEGORY_ID,
    label: "其他",
    folderName: "其他",
    keywords: [],
  },
];

export function normalizeImportCategories(value: unknown): ImportCategory[] {
  const rawItems = Array.isArray(value) ? value : DEFAULT_IMPORT_CATEGORIES;
  const out: ImportCategory[] = [];
  const seen = new Set<string>();

  for (const raw of rawItems) {
    if (!raw || typeof raw !== "object") continue;
    const obj = raw as Partial<ImportCategory>;
    const id = normalizeCategoryId(obj.id);
    if (!id || seen.has(id)) continue;
    const label = normalizeCategoryLabel(obj.label, id);
    const folderName = normalizeCategoryFolderName(obj.folderName, label);
    out.push({
      id,
      label,
      folderName,
      keywords: normalizeKeywords(obj.keywords),
    });
    seen.add(id);
  }

  if (!seen.has(OTHER_CATEGORY_ID)) {
    const fallback =
      DEFAULT_IMPORT_CATEGORIES.find((c) => c.id === OTHER_CATEGORY_ID) ??
      ({
        id: OTHER_CATEGORY_ID,
        label: "其他",
        folderName: "其他",
        keywords: [],
      } satisfies ImportCategory);
    out.push({ ...fallback, keywords: [...fallback.keywords] });
  }

  return out.length > 0 ? out : DEFAULT_IMPORT_CATEGORIES.map(cloneCategory);
}

export function findImportCategory(
  categories: ImportCategory[],
  categoryId: string | null | undefined,
): ImportCategory {
  return (
    categories.find((category) => category.id === categoryId) ??
    categories.find((category) => category.id === OTHER_CATEGORY_ID) ??
    DEFAULT_IMPORT_CATEGORIES.find((category) => category.id === OTHER_CATEGORY_ID)!
  );
}

export function resolveImportCategoryId(
  categoryId: string | null | undefined,
  categories: ImportCategory[],
): string {
  return findImportCategory(categories, categoryId).id;
}

export function renderCategoryPromptList(categories: ImportCategory[]): string {
  return categories
    .map((category) => {
      const keywords =
        category.keywords.length > 0 ? `；关键词：${category.keywords.join("、")}` : "";
      return `- ${category.id}: ${category.label}（目录：${category.folderName}${keywords}）`;
    })
    .join("\n");
}

export function categoryPathSegment(category: ImportCategory): string {
  return normalizeCategoryFolderName(category.folderName, category.label);
}

export function normalizeCategoryId(value: unknown): string {
  if (typeof value !== "string") return "";
  return slugify(value)
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 48);
}

export function normalizeCategoryLabel(value: unknown, fallbackId = OTHER_CATEGORY_ID): string {
  if (typeof value !== "string") return fallbackId;
  const trimmed = value.trim().replace(/\s+/g, " ");
  return trimmed.slice(0, 40) || fallbackId;
}

export function normalizeCategoryFolderName(value: unknown, fallback: string): string {
  const raw = typeof value === "string" && value.trim().length > 0 ? value : fallback;
  const normalized = raw
    .trim()
    .replace(/\\/g, "/")
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)
    .join("")
    .replace(/[:*?"<>|#^[\]]/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 60);
  return normalized || "其他";
}

function normalizeKeywords(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const normalized = item.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized.slice(0, 40));
  }
  return out.slice(0, 12);
}

function cloneCategory(category: ImportCategory): ImportCategory {
  return { ...category, keywords: [...category.keywords] };
}
