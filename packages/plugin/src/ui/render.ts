export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function highlight(text: string, query: string): string {
  const terms = uniqueTerms(query);
  if (terms.length === 0) return escapeHtml(text);
  const pattern = terms.map(escapeRegExp).join("|");
  const regex = new RegExp(pattern, "gi");
  let out = "";
  let lastIndex = 0;
  for (const match of text.matchAll(regex)) {
    const index = match.index ?? 0;
    const value = match[0] ?? "";
    out += escapeHtml(text.slice(lastIndex, index));
    out += `<mark class="aether-hit">${escapeHtml(value)}</mark>`;
    lastIndex = index + value.length;
  }
  out += escapeHtml(text.slice(lastIndex));
  return out;
}

function uniqueTerms(query: string): string[] {
  const seen = new Set<string>();
  return query
    .trim()
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length > 0)
    .sort((a, b) => b.length - a.length)
    .filter((term) => {
      const key = term.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
