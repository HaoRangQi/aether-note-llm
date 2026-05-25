import { extractVariables, findMissingPromptVariables } from "@aether/core";

export interface PromptVariableDiagnostics {
  used: string[];
  available: string[];
  missing: string[];
  unusedAvailable: string[];
}

export function analyzePromptVariables(
  template: string,
  availableVariables: readonly string[],
  runtimeVariables: readonly string[] = [],
): PromptVariableDiagnostics {
  const available = uniqueNames(availableVariables);
  const providedNames = uniqueNames([...available, ...runtimeVariables]);
  const provided = Object.fromEntries(providedNames.map((name) => [name, ""])) as Record<
    string,
    string
  >;
  const used = extractVariables(template);

  return {
    used,
    available,
    missing: findMissingPromptVariables(template, provided),
    unusedAvailable: available.filter((name) => !used.includes(name)),
  };
}

function uniqueNames(names: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of names) {
    const name = raw.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}
