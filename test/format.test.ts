import { describe, expect, test } from "bun:test";
import { CrtShError } from "../src/api";
import {
  formatCsv,
  formatError,
  formatJson,
  formatMultiDomainJson,
  formatMultiDomainResults,
  formatSubdomains,
  formatTable,
} from "../src/format";
import type { CrtShEntry } from "../src/schemas";

function makeEntry(overrides: Partial<CrtShEntry> = {}): CrtShEntry {
  return {
    issuer_ca_id: 1,
    issuer_name: "Test CA",
    common_name: "example.com",
    name_value: "example.com",
    id: 1,
    entry_timestamp: null,
    not_before: "2024-01-01",
    not_after: "2025-01-01",
    serial_number: "abc123",
    result_count: 1,
    ...overrides,
  };
}

describe("formatJson", () => {
  test("returns valid JSON for entries", () => {
    const entries = [makeEntry()];
    const output = formatJson(entries);
    const parsed = JSON.parse(output);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe(1);
  });

  test("returns empty array JSON for no entries", () => {
    const output = formatJson([]);
    expect(JSON.parse(output)).toEqual([]);
  });

  test("output is pretty-printed with 2-space indent", () => {
    const output = formatJson([makeEntry()]);
    expect(output).toContain("\n");
    expect(output).toContain("  ");
  });
});

describe("formatTable", () => {
  test("returns 'No results found.' for empty entries", () => {
    expect(formatTable([])).toBe("No results found.");
  });

  test("includes header row with column names", () => {
    const output = formatTable([makeEntry()]);
    expect(output).toContain("ID");
    expect(output).toContain("Common Name");
    expect(output).toContain("Not Before");
    expect(output).toContain("Not After");
    expect(output).toContain("Issuer");
  });

  test("includes separator line", () => {
    const output = formatTable([makeEntry()]);
    const lines = output.split("\n");
    expect(lines[1]).toMatch(/^-+$/);
  });

  test("includes entry data in rows", () => {
    const output = formatTable([
      makeEntry({ id: 42, common_name: "test.com" }),
    ]);
    expect(output).toContain("42");
    expect(output).toContain("test.com");
  });

  test("truncates long common names", () => {
    const longName = "a".repeat(50);
    const output = formatTable([makeEntry({ common_name: longName })]);
    expect(output).toContain("…");
  });

  test("handles multiple entries", () => {
    const entries = [
      makeEntry({ id: 1, common_name: "a.com" }),
      makeEntry({ id: 2, common_name: "b.com" }),
    ];
    const output = formatTable(entries);
    const lines = output.split("\n");
    // header + separator + 2 rows
    expect(lines).toHaveLength(4);
  });
});

describe("formatSubdomains", () => {
  test("returns 'No subdomains found.' for empty list", () => {
    expect(formatSubdomains([])).toBe("No subdomains found.");
  });

  test("returns newline-separated subdomains", () => {
    const output = formatSubdomains(["a.com", "b.com", "c.com"]);
    expect(output).toBe("a.com\nb.com\nc.com");
  });

  test("handles single subdomain", () => {
    expect(formatSubdomains(["only.com"])).toBe("only.com");
  });
});

describe("formatCsv", () => {
  test("returns header row for empty array", () => {
    const output = formatCsv([]);
    expect(output).toBe(
      "issuer_ca_id,issuer_name,common_name,name_value,id,entry_timestamp,not_before,not_after,serial_number,result_count",
    );
  });

  test("formats single entry correctly with 10 columns", () => {
    const output = formatCsv([makeEntry()]);
    const lines = output.split("\r\n");
    expect(lines).toHaveLength(2);
    const cols = lines[1].split(",");
    expect(cols).toHaveLength(10);
  });

  test("quotes fields with commas", () => {
    const output = formatCsv([makeEntry({ issuer_name: "CA, Inc." })]);
    expect(output).toContain('"CA, Inc."');
  });

  test("quotes fields with newlines", () => {
    const output = formatCsv([makeEntry({ name_value: "a.com\nb.com" })]);
    expect(output).toContain('"a.com\nb.com"');
  });

  test("escapes double quotes", () => {
    const output = formatCsv([makeEntry({ issuer_name: 'CA "Test"' })]);
    expect(output).toContain('"CA ""Test"""');
  });

  test("renders null entry_timestamp as empty", () => {
    const output = formatCsv([makeEntry({ entry_timestamp: null })]);
    const lines = output.split("\r\n");
    const cols = lines[1].split(",");
    // entry_timestamp is the 6th column (index 5)
    expect(cols[5]).toBe("");
  });

  test("uses CRLF line endings", () => {
    const output = formatCsv([makeEntry()]);
    expect(output).toContain("\r\n");
    // Should not have bare \n in the line-ending positions
    const withoutCrlf = output.replace(/\r\n/g, "");
    // name_value could have \n but our test entry doesn't
    expect(withoutCrlf).not.toContain("\n");
  });
});

describe("formatMultiDomainJson", () => {
  test("groups results by domain and includes errors", () => {
    const results = new Map([
      ["example.com", [makeEntry({ common_name: "example.com" })]],
    ]);
    const errors = new Map([
      ["fail.com", new CrtShError("server error", "SERVER_ERROR")],
    ]);
    const output = formatMultiDomainJson(results, errors);
    const parsed = JSON.parse(output);
    expect(parsed["example.com"].entries).toHaveLength(1);
    expect(parsed["fail.com"].error).toBe("server error");
    expect(parsed["fail.com"].code).toBe("SERVER_ERROR");
  });
});

describe("formatMultiDomainResults", () => {
  test("shows === domain === headers", () => {
    const results = new Map([
      ["a.com", [makeEntry()]],
      ["b.com", [makeEntry()]],
    ]);
    const errors = new Map<string, CrtShError>();
    const output = formatMultiDomainResults(results, errors, formatTable);
    expect(output).toContain("=== a.com ===");
    expect(output).toContain("=== b.com ===");
  });

  test("includes error messages for failed domains", () => {
    const results = new Map<string, import("../src/schemas").CrtShEntry[]>();
    const errors = new Map([
      ["fail.com", new CrtShError("timeout", "NETWORK_ERROR")],
    ]);
    const output = formatMultiDomainResults(results, errors, formatTable);
    expect(output).toContain("=== fail.com ===");
    expect(output).toContain("Error [NETWORK_ERROR]: timeout");
  });
});

describe("formatError", () => {
  test("returns JSON with error and code fields", () => {
    const output = formatError("something broke", "BROKEN");
    const parsed = JSON.parse(output);
    expect(parsed.error).toBe("something broke");
    expect(parsed.code).toBe("BROKEN");
  });

  test("output is pretty-printed", () => {
    const output = formatError("msg", "CODE");
    expect(output).toContain("\n");
  });
});
