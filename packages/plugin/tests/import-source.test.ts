import { describe, expect, it } from "vitest";
import {
  buildImportSourceFromFile,
  buildImportSourceFromPaste,
  IMPORT_FILE_ACCEPT,
} from "../src/ui/import-source.js";

describe("import source file mapping", () => {
  it("exposes file types that the plugin can map into core import sources", () => {
    expect(IMPORT_FILE_ACCEPT).toContain(".md");
    expect(IMPORT_FILE_ACCEPT).toContain(".txt");
    expect(IMPORT_FILE_ACCEPT).toContain(".json");
  });

  it("maps markdown files to markdown-file payloads", () => {
    expect(buildImportSourceFromFile("# Title\nBody", "note.md")).toMatchObject({
      kind: "file",
      label: "note.md",
      payload: { type: "markdown-file", path: "note.md", content: "# Title\nBody" },
    });
  });

  it("maps url text files to url-list payloads", () => {
    expect(
      buildImportSourceFromFile("https://a.example\nnot a url\nhttps://b.example", "links.txt"),
    ).toMatchObject({
      payload: {
        type: "url-list",
        urls: ["https://a.example", "not a url", "https://b.example"],
      },
    });
  });

  it("maps pasted url lists to url-list payloads", () => {
    expect(buildImportSourceFromPaste("https://a.example\nhttps://b.example", "paste-1")).toEqual({
      kind: "paste",
      label: "paste-1",
      payload: { type: "url-list", urls: ["https://a.example", "https://b.example"] },
    });
  });

  it("keeps pasted prose as paste-text", () => {
    expect(buildImportSourceFromPaste("plain notes", "paste-2")).toEqual({
      kind: "paste",
      label: "paste-2",
      payload: { type: "paste-text", text: "plain notes" },
    });
  });

  it("maps non-url txt files to markdown-file payloads", () => {
    expect(buildImportSourceFromFile("plain notes", "notes.txt")).toMatchObject({
      payload: { type: "markdown-file", path: "notes.txt", content: "plain notes" },
    });
  });

  it("keeps unsupported zip files out of the UI contract until plugin-side extraction exists", () => {
    expect(IMPORT_FILE_ACCEPT).not.toContain(".zip");
    expect(buildImportSourceFromFile("binary", "notion.zip")).toBeNull();
  });
});
