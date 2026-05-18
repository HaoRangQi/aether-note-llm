import { normalizeUrl } from "../url-normalize.js";
import type { ImportSource, RawCandidate } from "../types.js";
import type { SourceConnector } from "./connector.js";

/**
 * iTab 备份文件（.itabdata）导入连接器。
 *
 * 支持两类内容：
 *   1. navConfig 里 type="link" 的书签（kind: "bookmark"）
 *      - 按 page 名 + 文件夹路径生成 tags
 *      - 跳过 chrome:// / itab:// 等非 http 链接
 *   2. notes 里的备忘录（kind: "note"）
 *      - title 作为标题，content 作为正文
 *      - ct（创建时间戳）保留在 sourceMeta
 */

interface ITabData {
  navConfig?: ITabPage[];
  notes?: ITabNote[];
}

interface ITabPage {
  id?: string;
  name?: string;
  children?: ITabItem[];
}

interface ITabItem {
  id?: string;
  name?: string;
  type?: string;
  url?: string;
  children?: ITabItem[];
  component?: string;
}

interface ITabNote {
  id?: string;
  title?: string;
  content?: string;
  ct?: number;
  ut?: number;
}

export class ITabConnector implements SourceConnector {
  readonly id = "itab";
  readonly name = "iTab 备份 (.itabdata)";

  canHandle(source: ImportSource): boolean {
    return source.payload.type === "itab-data";
  }

  async *parse(source: ImportSource): AsyncIterable<RawCandidate> {
    if (source.payload.type !== "itab-data") return;
    let data: ITabData;
    try {
      data = JSON.parse(source.payload.raw) as ITabData;
    } catch {
      return;
    }

    const seenUrls = new Set<string>();

    // —— 1. 书签 ——
    for (const page of data.navConfig ?? []) {
      const pageName = page.name ?? "";
      yield* walkItems(page.children ?? [], [pageName], seenUrls);
    }

    // —— 2. 备忘录 ——
    for (const note of data.notes ?? []) {
      const title = note.title?.trim() ?? "";
      const content = note.content?.trim() ?? "";
      if (!title && !content) continue;
      yield {
        title: title || null,
        content: content || title,
        tags: ["itab-note"],
        url: null,
        kind: "note",
        assets: [],
        sourceRef: `itab-note:${note.id ?? title}`,
        sourceMeta: {
          createdAt: note.ct ?? null,
          updatedAt: note.ut ?? null,
        },
      };
    }
  }
}

async function* walkItems(
  items: ITabItem[],
  folderPath: string[],
  seen: Set<string>,
): AsyncIterable<RawCandidate> {
  for (const item of items) {
    const t = item.type ?? "";

    if (t === "link" && item.url) {
      const url = item.url;
      // 跳过浏览器内部链接
      if (!url.startsWith("http://") && !url.startsWith("https://")) continue;
      const normalized = normalizeUrl(url);
      if (seen.has(normalized)) continue;
      seen.add(normalized);

      // 用文件夹路径作为 tags（过滤空字符串）
      const tags = folderPath.filter((s) => s.length > 0);

      yield {
        title: item.name ?? null,
        content: "",
        tags,
        url,
        kind: "bookmark",
        assets: [],
        sourceRef: normalized,
        sourceMeta: {
          folderPath: folderPath.join("/"),
          itabId: item.id ?? null,
        },
      };
    } else if (item.children) {
      const nextPath = item.name ? [...folderPath, item.name] : folderPath;
      yield* walkItems(item.children, nextPath, seen);
    }
  }
}
