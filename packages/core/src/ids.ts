import { monotonicFactory } from "ulid";

const factory = monotonicFactory();

export function newUlid(seedTime?: number): string {
  return seedTime === undefined ? factory() : factory(seedTime);
}

export function slugify(title: string, maxLen = 40): string {
  const cleaned = title
    .normalize("NFKC")
    // Strip reserved filesystem chars: < > : " / \ | ? *
    .replace(/[<>:"/\\|?*]+/g, "")
    // Collapse whitespace into single hyphen
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  const out = cleaned.length === 0 ? "untitled" : cleaned;
  return out.length > maxLen ? out.slice(0, maxLen) : out;
}
