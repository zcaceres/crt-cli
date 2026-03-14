import { CrtShResponseSchema } from "./schemas";
import type { CrtShEntry } from "./schemas";

/** Error thrown by crt.sh API operations. The `code` field identifies the error category. */
export class CrtShError extends Error {
  constructor(
    message: string,
    public code: string
  ) {
    super(message);
    this.name = "CrtShError";
  }
}

/**
 * Build the crt.sh query URL for a domain.
 * @param query - Domain or pattern to search for.
 * @param options.wildcard - Prefix query with `%.` for subdomain matching.
 * @param options.excludeExpired - Exclude certificates that have expired.
 * @returns Fully-qualified crt.sh URL with query parameters.
 */
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

export const MAX_RETRIES = 3;

/**
 * Fetch a URL with retry and exponential backoff.
 * Retries on network errors and HTTP 502; all other HTTP errors fail immediately.
 * @param url - URL to fetch.
 * @param options.baseDelay - Base delay in ms between retries (doubled each attempt).
 * @param options.fetchFn - Fetch implementation (defaults to global `fetch`; injectable for testing).
 * @returns The successful `Response`.
 * @throws {CrtShError} With code `NETWORK_ERROR`, `SERVER_ERROR`, or `HTTP_ERROR`.
 */
export async function fetchWithRetry(
  url: string,
  options: { baseDelay: number; fetchFn: typeof fetch }
): Promise<Response> {
  let lastError: CrtShError | undefined;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await new Promise(r => setTimeout(r, options.baseDelay * 2 ** (attempt - 1)));
    }

    let response: Response;
    try {
      response = await options.fetchFn(url, { signal: AbortSignal.timeout(30_000) });
    } catch (err) {
      lastError = new CrtShError(
        `Network error: ${err instanceof Error ? err.message : String(err)}`,
        "NETWORK_ERROR"
      );
      continue;
    }

    if (response.status === 502) {
      lastError = new CrtShError(
        "crt.sh returned 502 (server error or rate limit)",
        "SERVER_ERROR"
      );
      continue;
    }

    if (!response.ok) {
      throw new CrtShError(
        `crt.sh returned HTTP ${response.status}`,
        "HTTP_ERROR"
      );
    }

    return response;
  }

  throw lastError!;
}

/**
 * Search Certificate Transparency logs for certificates matching a domain.
 * Results are validated against the crt.sh JSON schema.
 * @param query - Domain or pattern to search for.
 * @param options.wildcard - Prefix query with `%.` for subdomain matching.
 * @param options.excludeExpired - Exclude expired certificates.
 * @returns Array of matching certificate entries (empty array if none found).
 * @throws {CrtShError} On network, HTTP, parse, or validation errors.
 */
export async function searchCertificates(
  query: string,
  options?: { wildcard?: boolean; excludeExpired?: boolean }
): Promise<CrtShEntry[]> {
  const url = buildUrl(query, options);

  const response = await fetchWithRetry(url, { baseDelay: 1000, fetchFn: fetch });

  let text: string;
  try {
    text = await response.text();
  } catch (err) {
    throw new CrtShError(
      `Network error reading response: ${err instanceof Error ? err.message : String(err)}`,
      "NETWORK_ERROR"
    );
  }
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

/**
 * Deduplicate certificate entries by serial number, keeping the first occurrence.
 * @param entries - Array of certificate entries to deduplicate.
 * @returns New array with duplicate serial numbers removed.
 */
export function dedupeBySerial(entries: CrtShEntry[]): CrtShEntry[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    if (seen.has(entry.serial_number)) return false;
    seen.add(entry.serial_number);
    return true;
  });
}

/**
 * Validate a certificate ID string (must be a positive integer within safe range).
 * @param id - Raw string to validate as a crt.sh certificate ID.
 * @returns Object with `valid: true` and parsed `certId`, or `valid: false` with `reason`.
 */
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

/**
 * Extract unique subdomains from certificate `name_value` fields.
 * @param entries - Certificate entries to extract subdomains from.
 * @returns Sorted, deduplicated array of lowercase subdomain strings.
 */
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
