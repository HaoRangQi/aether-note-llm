/**
 * 简单的变量替换：用 vars[k] 替换 {{k}}。未提供的变量替换为空字符串。
 * 不做条件 / 循环 — 故意保持简单，复杂模板需要用代码组装 vars 后再传入。
 */
export function renderPrompt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (_, name: string) => {
    const v = vars[name];
    if (v === undefined || v === null) return "";
    return String(v);
  });
}

/** 提取模板中用到的所有变量名（去重，保持出现顺序）。 */
export function extractVariables(template: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const re = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(template)) !== null) {
    const name = m[1];
    if (name && !seen.has(name)) {
      seen.add(name);
      out.push(name);
    }
  }
  return out;
}
