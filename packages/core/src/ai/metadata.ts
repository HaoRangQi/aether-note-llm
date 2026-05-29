import type { ProviderRegistry } from "../provider/registry.js";
import type { RoleRegistry } from "../roles/role-registry.js";
import { runRole } from "../roles/run-role.js";
import {
  DEFAULT_IMPORT_CATEGORIES,
  renderCategoryPromptList,
  resolveImportCategoryId,
} from "../import/categories.js";
import type { Feature, ImportCategory, RawCandidate, TokenUsage } from "../types.js";

export interface MetadataProposal {
  title: string;
  tags: string[];
  summary: string;
  categoryId: string;
}

export async function proposeMetadata(args: {
  registry: ProviderRegistry;
  roles: RoleRegistry;
  candidate: RawCandidate;
  fallbackTitle: string;
  categories?: ImportCategory[];
  providerOverride?: {
    providerId: string;
    modelName: string;
  };
  signal?: AbortSignal;
  onUsage?: (args: {
    providerId: string;
    feature: Feature;
    model: string;
    usage: TokenUsage;
  }) => void | Promise<void>;
}): Promise<MetadataProposal> {
  const { candidate, fallbackTitle } = args;
  const categories = args.categories?.length ? args.categories : DEFAULT_IMPORT_CATEGORIES;
  const opts: Parameters<typeof runRole>[0] = {
    registry: args.registry,
    roles: args.roles,
    roleId: "inbox_metadata",
    vars: {
      sourceRef: candidate.sourceRef,
      kind: candidate.kind,
      urlLine: candidate.url ? `URL：${candidate.url}` : "",
      categoryList: renderCategoryPromptList(categories),
      content: candidate.content.slice(0, 4000),
    },
  };
  if (args.providerOverride) opts.providerOverride = args.providerOverride;
  if (args.signal) opts.signal = args.signal;
  try {
    const r = await runRole(opts);
    if (r.usage) {
      await args.onUsage?.({
        providerId: r.role.providerId,
        feature: "inbox_metadata",
        model: r.role.modelName,
        usage: r.usage,
      });
    }
    return parseProposal(r.output, categories) ?? fallbackProposal(candidate, fallbackTitle);
  } catch {
    return fallbackProposal(candidate, fallbackTitle);
  }
}

export function parseProposal(
  raw: unknown,
  categories: ImportCategory[] = DEFAULT_IMPORT_CATEGORIES,
): MetadataProposal | null {
  if (raw === null || raw === undefined) return null;
  let obj: Record<string, unknown> | null = null;
  if (typeof raw === "string") {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      obj = JSON.parse(m[0]) as Record<string, unknown>;
    } catch {
      return null;
    }
  } else if (typeof raw === "object") {
    obj = raw as Record<string, unknown>;
  }
  if (!obj) return null;
  if (typeof obj.title !== "string") return null;
  const tags = Array.isArray(obj.tags)
    ? (obj.tags as unknown[]).filter((t): t is string => typeof t === "string").slice(0, 5)
    : [];
  return {
    title: obj.title.trim().slice(0, 80),
    tags,
    summary: typeof obj.summary === "string" ? obj.summary.trim().slice(0, 160) : "",
    categoryId: resolveImportCategoryId(
      typeof obj.categoryId === "string" ? obj.categoryId : null,
      categories,
    ),
  };
}

function fallbackProposal(c: RawCandidate, fallbackTitle: string): MetadataProposal {
  const firstLine =
    c.content
      .split("\n")
      .find((l) => l.trim().length > 0)
      ?.trim() ?? "";
  const title = c.title ?? (firstLine.length > 0 ? firstLine.slice(0, 80) : fallbackTitle);
  return { title, tags: c.tags, summary: "", categoryId: "other" };
}
