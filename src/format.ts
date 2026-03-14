import type { CrtShEntry } from "./schemas";

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
    s.length > max ? s.slice(0, max - 1) + "…" : s;

  const rows = entries.map((e) =>
    [
      String(e.id).padEnd(12),
      truncate(e.common_name, 40).padEnd(40),
      e.not_before.slice(0, 22).padEnd(22),
      e.not_after.slice(0, 22).padEnd(22),
      truncate(e.issuer_name, 60),
    ].join(" | ")
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
