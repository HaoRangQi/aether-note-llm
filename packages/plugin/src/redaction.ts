const REDACTED = "<redacted>";

export function redactSensitiveText(value: string): string {
  return redactUrlSecrets(value)
    .replace(/Bearer\s+[^\s"'`]+/gi, `Bearer ${REDACTED}`)
    .replace(
      /\b(proxy-authorization|set-cookie|cookie)(\s*:\s*)([^"'`\r\n]*?)(?=,\s*[A-Za-z-]+(?:\s*:|=)|\s+(?:proxy-authorization|set-cookie|cookie)=|\s+https?:\/\/|$)/gi,
      `$1$2${REDACTED}`,
    )
    .replace(/\b(proxy-authorization|set-cookie|cookie)=([^&\s"'`]+)/gi, `$1=${REDACTED}`)
    .replace(/\b(authorization)(\s*:\s*)([^"'`,;]+)/gi, `$1$2${REDACTED}`)
    .replace(
      /\b([A-Za-z0-9_-]*(?:api[_-]?key|token|secret|password))=([^&\s"'`]+)/gi,
      `$1=${REDACTED}`,
    )
    .replace(
      /\b([A-Za-z0-9_-]*(?:api[_-]?key|token|secret|password))(\s*:\s*)([^\s"'`,;]+)/gi,
      `$1$2${REDACTED}`,
    )
    .replace(/\bsk-[A-Za-z0-9_-]{12,}/g, `sk-${REDACTED}`);
}

export function isSensitiveDiagnosticKey(key: string): boolean {
  const normalized = key.replace(/[-_.\s]/g, "").toLowerCase();
  return (
    normalized === "authorization" ||
    normalized === "proxyauthorization" ||
    normalized === "cookie" ||
    normalized === "setcookie" ||
    normalized === "key" ||
    normalized === "apikey" ||
    normalized === "accesstoken" ||
    normalized === "refreshtoken" ||
    normalized === "secret" ||
    normalized === "password" ||
    normalized.endsWith("apikey") ||
    normalized.endsWith("token") ||
    normalized.endsWith("secret") ||
    normalized.endsWith("password")
  );
}

function redactUrlSecrets(value: string): string {
  const withUrlFragmentsRedacted = value.replace(/https?:\/\/[^\s"'`<>]+/gi, (raw) =>
    redactSingleUrlSecrets(raw),
  );
  if (withUrlFragmentsRedacted !== value) return withUrlFragmentsRedacted;
  return redactSingleUrlSecrets(value);
}

function redactSingleUrlSecrets(value: string): string {
  try {
    const url = new URL(value);
    let changed = false;
    if (url.username) {
      url.username = REDACTED;
      changed = true;
    }
    if (url.password) {
      url.password = REDACTED;
      changed = true;
    }
    for (const key of [...url.searchParams.keys()]) {
      if (!isSensitiveDiagnosticKey(key)) continue;
      url.searchParams.set(key, REDACTED);
      changed = true;
    }
    if (url.hash) {
      const redactedHash = redactUrlFragmentSecrets(url.hash);
      if (redactedHash !== url.hash) {
        url.hash = redactedHash;
        changed = true;
      }
    }
    return changed ? url.toString().replaceAll(encodeURIComponent(REDACTED), REDACTED) : value;
  } catch {
    return value;
  }
}

function redactUrlFragmentSecrets(hash: string): string {
  const prefix = hash.startsWith("#") ? "#" : "";
  const raw = prefix ? hash.slice(1) : hash;
  const queryIndex = raw.indexOf("?");
  if (queryIndex >= 0) {
    const routePrefix = raw.slice(0, queryIndex + 1);
    const redactedQuery = redactUrlSearchParams(raw.slice(queryIndex + 1));
    return redactedQuery === null ? hash : `${prefix}${routePrefix}${redactedQuery}`;
  }
  const redactedParams = redactUrlSearchParams(raw);
  return redactedParams === null ? hash : `${prefix}${redactedParams}`;
}

function redactUrlSearchParams(value: string): string | null {
  const params = new URLSearchParams(value);
  let changed = false;
  for (const key of [...params.keys()]) {
    if (!isSensitiveDiagnosticKey(key)) continue;
    params.set(key, REDACTED);
    changed = true;
  }
  return changed ? params.toString().replaceAll(encodeURIComponent(REDACTED), REDACTED) : null;
}
