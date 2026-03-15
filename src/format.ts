import type { CrtShError } from "./api";
import type { CrtShEntry } from "./schemas";

/** Quote a CSV field per RFC 4180: wrap in double quotes if it contains commas, newlines, or quotes; escape " as "". */
function csvQuote(value: string): string {
  if (value.includes(",") || value.includes("\n") || value.includes('"')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

const CSV_COLUMNS = [
  "issuer_ca_id",
  "issuer_name",
  "common_name",
  "name_value",
  "id",
  "entry_timestamp",
  "not_before",
  "not_after",
  "serial_number",
  "result_count",
] as const;

/** Format certificate entries as RFC 4180 CSV with CRLF line endings. */
export function formatCsv(entries: CrtShEntry[]): string {
  const header = CSV_COLUMNS.join(",");
  const rows = entries.map((e) =>
    CSV_COLUMNS.map((col) => csvQuote(String(e[col] ?? ""))).join(","),
  );
  return [header, ...rows].join("\r\n");
}

/** Format certificate entries as pretty-printed JSON. */
export function formatJson(entries: CrtShEntry[]): string {
  return JSON.stringify(entries, null, 2);
}

/** Format certificate entries as an ASCII table with columns for ID, common name, dates, and issuer. */
export function formatTable(entries: CrtShEntry[]): string {
  if (entries.length === 0) return "No results found.";

  const header = [
    "ID".padEnd(12),
    "Common Name".padEnd(40),
    "Not Before".padEnd(22),
    "Not After".padEnd(22),
    "Issuer",
  ].join(" | ");

  const separator = "-".repeat(header.length);

  const truncate = (s: string, max: number) =>
    s.length > max ? `${s.slice(0, max - 1)}…` : s;

  const rows = entries.map((e) =>
    [
      String(e.id).padEnd(12),
      truncate(e.common_name, 40).padEnd(40),
      e.not_before.slice(0, 22).padEnd(22),
      e.not_after.slice(0, 22).padEnd(22),
      truncate(e.issuer_name, 60),
    ].join(" | "),
  );

  return [header, separator, ...rows].join("\n");
}

/** Format a subdomain list as newline-separated text. Returns a message if empty. */
export function formatSubdomains(subdomains: string[]): string {
  if (subdomains.length === 0) return "No subdomains found.";
  return subdomains.join("\n");
}

/** Format an error as a JSON object with `error` and `code` fields. */
export function formatError(message: string, code: string): string {
  return JSON.stringify({ error: message, code }, null, 2);
}

/** Format multi-domain results as a JSON object keyed by domain. */
export function formatMultiDomainJson(
  results: Map<string, CrtShEntry[]>,
  errors: Map<string, CrtShError>,
): string {
  const obj: Record<string, unknown> = {};
  for (const [domain, entries] of results) {
    obj[domain] = { entries };
  }
  for (const [domain, error] of errors) {
    obj[domain] = { error: error.message, code: error.code };
  }
  return JSON.stringify(obj, null, 2);
}

/** Format multi-domain results with === domain === headers, using a per-domain formatter. */
export function formatMultiDomainResults(
  results: Map<string, CrtShEntry[]>,
  errors: Map<string, CrtShError>,
  formatFn: (entries: CrtShEntry[]) => string,
): string {
  const sections: string[] = [];
  for (const [domain, entries] of results) {
    sections.push(`=== ${domain} ===\n${formatFn(entries)}`);
  }
  for (const [domain, error] of errors) {
    sections.push(`=== ${domain} ===\nError [${error.code}]: ${error.message}`);
  }
  return sections.join("\n\n");
}
