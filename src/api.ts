import { CrtShResponseSchema } from "./schemas";
import type { CrtShEntry } from "./schemas";

export class CrtShError extends Error {
  constructor(
    message: string,
    public code: string
  ) {
    super(message);
    this.name = "CrtShError";
  }
}

export function buildUrl(
  query: string,
  options?: { wildcard?: boolean; excludeExpired?: boolean }
): string {
  let q = query;
  if (options?.wildcard && !query.startsWith("%.")) {
    q = `%.${query}`;
  }
  const params = new URLSearchParams({ q, output: "json" });
  if (options?.excludeExpired) {
    params.set("exclude", "expired");
  }
  return `https://crt.sh/?${params.toString()}`;
}

export async function searchCertificates(
  query: string,
  options?: { wildcard?: boolean; excludeExpired?: boolean }
): Promise<CrtShEntry[]> {
  const url = buildUrl(query, options);

  let response: Response;
  try {
    response = await fetch(url);
  } catch (err) {
    throw new CrtShError(
      `Network error: ${err instanceof Error ? err.message : String(err)}`,
      "NETWORK_ERROR"
    );
  }

  if (response.status === 502) {
    throw new CrtShError(
      "crt.sh returned 502 (server error or rate limit)",
      "SERVER_ERROR"
    );
  }

  if (!response.ok) {
    throw new CrtShError(
      `crt.sh returned HTTP ${response.status}`,
      "HTTP_ERROR"
    );
  }

  const text = await response.text();
  if (!text.trim() || text.trim() === "[]") {
    return [];
  }

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new CrtShError("Invalid JSON response from crt.sh", "PARSE_ERROR");
  }

  const result = CrtShResponseSchema.safeParse(data);
  if (!result.success) {
    throw new CrtShError(
      `Schema validation failed: ${result.error.message}`,
      "VALIDATION_ERROR"
    );
  }

  return result.data;
}

export function dedupeBySerial(entries: CrtShEntry[]): CrtShEntry[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    if (seen.has(entry.serial_number)) return false;
    seen.add(entry.serial_number);
    return true;
  });
}

export function validateCertId(id: string): { valid: true; certId: number } | { valid: false; reason: string } {
  if (!/^\d+$/.test(id)) {
    return { valid: false, reason: `Invalid certificate ID: ${id}` };
  }
  const certId = Number(id);
  if (certId <= 0 || certId > Number.MAX_SAFE_INTEGER) {
    return { valid: false, reason: `Invalid certificate ID: ${id}` };
  }
  return { valid: true, certId };
}

export function extractSubdomains(entries: CrtShEntry[]): string[] {
  const subdomains = new Set<string>();
  for (const entry of entries) {
    for (const name of entry.name_value.split("\n")) {
      const trimmed = name.trim().toLowerCase();
      if (trimmed) subdomains.add(trimmed);
    }
  }
  return [...subdomains].sort();
}
