import type { SearchAnswerResponse } from "@aether/core";

export function formatAnswerWithSources(answer: SearchAnswerResponse): string {
  const lines = [answer.answer.trim()];
  if (answer.citations.length === 0) return lines.join("\n").trim();

  lines.push("", "Sources:");
  for (const citation of answer.citations) {
    lines.push(
      `[${citation.index}] ${citation.title}`,
      `Path: ${citation.vaultPath}`,
      `Heading: ${citation.headingPath || "-"}`,
      `URL: ${citation.url || "-"}`,
      `Excerpt: ${citation.excerpt}`,
    );
    if (citation.truncated) {
      lines.push("Note: excerpt was trimmed to fit the context budget.");
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}
