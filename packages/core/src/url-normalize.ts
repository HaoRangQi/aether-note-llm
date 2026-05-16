const TRACKING = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "fbclid",
  "gclid",
  "msclkid",
  "mc_cid",
  "mc_eid",
  "yclid",
  "ref",
  "ref_src",
  "spm",
]);

export function normalizeUrl(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return raw.trim();
  }
  u.protocol = u.protocol.toLowerCase();
  u.hostname = u.hostname.toLowerCase();
  u.hash = "";
  const keep: Array<[string, string]> = [];
  for (const [k, v] of u.searchParams) {
    if (!TRACKING.has(k.toLowerCase())) keep.push([k, v]);
  }
  u.search = "";
  for (const [k, v] of keep) u.searchParams.append(k, v);
  let s = u.toString();
  if (s.endsWith("/")) {
    const pathOnly = u.pathname;
    if (pathOnly !== "/" && pathOnly.length > 1) s = s.slice(0, -1);
  }
  return s;
}
