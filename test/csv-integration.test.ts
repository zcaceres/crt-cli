import { describe, expect, test } from "bun:test";
import { CrtShError } from "../src/api";
import { formatCsv, formatMultiDomainResults } from "../src/format";
import type { CrtShEntry } from "../src/schemas";
import { exampleComEntries, exampleOrgEntries } from "./fixtures/crt-responses";

/** Naive RFC 4180 CSV field parser that handles quoted fields with embedded commas, newlines, and escaped quotes. */
function parseCsvRow(row: string): string[] {
  const fields: string[] = [];
  let i = 0;
  while (i <= row.length) {
    if (i === row.length) {
      fields.push("");
      break;
    }
    if (row[i] === '"') {
      // Quoted field
      let value = "";
      i++; // skip opening quote
      while (i < row.length) {
        if (row[i] === '"') {
          if (i + 1 < row.length && row[i + 1] === '"') {
            value += '"';
            i += 2;
          } else {
            i++; // skip closing quote
            break;
          }
        } else {
          value += row[i];
          i++;
        }
      }
      fields.push(value);
      if (i < row.length && row[i] === ",") i++; // skip comma
    } else {
      // Unquoted field
      const commaIdx = row.indexOf(",", i);
      if (commaIdx === -1) {
        fields.push(row.slice(i));
        break;
      }
      fields.push(row.slice(i, commaIdx));
      i = commaIdx + 1;
    }
  }
  return fields;
}

/** Split CSV text on CRLF record boundaries, respecting quoted fields that contain newlines. */
function splitCsvRecords(csv: string): string[] {
  const records: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      current += ch;
    } else if (ch === "\r" && csv[i + 1] === "\n" && !inQuotes) {
      records.push(current);
      current = "";
      i++; // skip \n
    } else {
      current += ch;
    }
  }
  if (current) records.push(current);
  return records;
}

describe("CSV format integration", () => {
  test("formats realistic entries as parseable CSV", () => {
    const csv = formatCsv(exampleComEntries);
    const records = splitCsvRecords(csv);

    // header + 3 data rows
    expect(records).toHaveLength(4);

    // Each row should have exactly 10 columns
    for (const record of records) {
      expect(parseCsvRow(record)).toHaveLength(10);
    }

    // Verify comma-in-issuer survives
    const row1Fields = parseCsvRow(records[1]);
    expect(row1Fields[1]).toBe(exampleComEntries[0].issuer_name);

    // Verify multiline name_value survives
    expect(row1Fields[3]).toBe("example.com\nwww.example.com");

    // Verify null entry_timestamp renders as empty
    expect(row1Fields[5]).toBe("");
  });

  test("CSV round-trip: parse back and compare field values", () => {
    const csv = formatCsv(exampleComEntries);
    const records = splitCsvRecords(csv);
    const headerFields = parseCsvRow(records[0]);

    expect(headerFields).toEqual([
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
    ]);

    for (let i = 0; i < exampleComEntries.length; i++) {
      const entry = exampleComEntries[i];
      const fields = parseCsvRow(records[i + 1]);

      expect(fields[0]).toBe(String(entry.issuer_ca_id));
      expect(fields[1]).toBe(entry.issuer_name);
      expect(fields[2]).toBe(entry.common_name);
      expect(fields[3]).toBe(entry.name_value);
      expect(fields[4]).toBe(String(entry.id));
      expect(fields[5]).toBe(String(entry.entry_timestamp ?? ""));
      expect(fields[6]).toBe(entry.not_before);
      expect(fields[7]).toBe(entry.not_after);
      expect(fields[8]).toBe(entry.serial_number);
      expect(fields[9]).toBe(String(entry.result_count));
    }
  });

  test("multi-domain CSV output separates domains with headers", () => {
    const results = new Map<string, CrtShEntry[]>([
      ["example.com", exampleComEntries],
      ["example.org", exampleOrgEntries],
    ]);
    const errors = new Map<string, CrtShError>();

    const output = formatMultiDomainResults(results, errors, formatCsv);

    expect(output).toContain("=== example.com ===");
    expect(output).toContain("=== example.org ===");

    // Extract CSV content under each header
    const sections = output.split(/\n\n/);
    expect(sections).toHaveLength(2);

    // example.com section: header row + 3 data rows
    const comSection = sections[0].replace("=== example.com ===\n", "");
    const comRecords = splitCsvRecords(comSection);
    expect(comRecords).toHaveLength(4); // header + 3

    // example.org section: header row + 2 data rows
    const orgSection = sections[1].replace("=== example.org ===\n", "");
    const orgRecords = splitCsvRecords(orgSection);
    expect(orgRecords).toHaveLength(3); // header + 2
  });

  test("multi-domain CSV with partial failure", () => {
    const results = new Map<string, CrtShEntry[]>([
      ["example.com", exampleComEntries],
    ]);
    const errors = new Map<string, CrtShError>([
      ["fail.com", new CrtShError("connection timed out", "NETWORK_ERROR")],
    ]);

    const output = formatMultiDomainResults(results, errors, formatCsv);

    expect(output).toContain("=== example.com ===");
    expect(output).toContain("=== fail.com ===");
    expect(output).toContain("Error [NETWORK_ERROR]: connection timed out");

    // Success domain still has valid CSV
    const sections = output.split(/\n\n/);
    const comSection = sections[0].replace("=== example.com ===\n", "");
    const comRecords = splitCsvRecords(comSection);
    expect(comRecords).toHaveLength(4);
  });
});
