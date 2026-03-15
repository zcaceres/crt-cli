import { describe, expect, test } from "bun:test";
import { CrtShError, dedupeBySerial, searchMultipleDomains } from "../src/api";
import {
  formatCsv,
  formatMultiDomainJson,
  formatMultiDomainResults,
  formatTable,
} from "../src/format";
import type { CrtShEntry } from "../src/schemas";
import { exampleComEntries, exampleOrgEntries } from "./fixtures/crt-responses";

/** Mock searchFn that returns fixture data per domain. */
function makeSearchFn(
  data: Map<string, CrtShEntry[]>,
  failDomains?: Map<string, CrtShError>,
) {
  return async (
    query: string,
    _options?: { wildcard?: boolean; excludeExpired?: boolean },
  ): Promise<CrtShEntry[]> => {
    if (failDomains?.has(query)) throw failDomains.get(query)!;
    return data.get(query) ?? [];
  };
}

describe("Multi-domain pipeline integration", () => {
  test("searchMultipleDomains → formatMultiDomainJson produces valid grouped JSON", async () => {
    const data = new Map([
      ["example.com", exampleComEntries],
      ["example.org", exampleOrgEntries],
    ]);
    const searchFn = makeSearchFn(data);

    const { results, errors } = await searchMultipleDomains(
      ["example.com", "example.org"],
      { delayMs: 0, searchFn },
    );

    const output = formatMultiDomainJson(results, errors);
    const parsed = JSON.parse(output);

    expect(parsed["example.com"].entries).toHaveLength(3);
    expect(parsed["example.org"].entries).toHaveLength(2);

    // Verify field values survive the pipeline
    expect(parsed["example.com"].entries[0].id).toBe(exampleComEntries[0].id);
    expect(parsed["example.org"].entries[1].common_name).toBe(
      "www.example.org",
    );
  });

  test("searchMultipleDomains → formatMultiDomainResults with formatTable", async () => {
    const data = new Map([
      ["example.com", exampleComEntries],
      ["example.org", exampleOrgEntries],
    ]);
    const searchFn = makeSearchFn(data);

    const { results, errors } = await searchMultipleDomains(
      ["example.com", "example.org"],
      { delayMs: 0, searchFn },
    );

    const output = formatMultiDomainResults(results, errors, formatTable);

    expect(output).toContain("=== example.com ===");
    expect(output).toContain("=== example.org ===");

    // Each table section should have header, separator, and data rows
    const sections = output.split(/\n\n/);
    expect(sections).toHaveLength(2);

    for (const section of sections) {
      const lines = section.split("\n");
      // First line is === domain ===, then header, separator, data rows
      const tableLines = lines.slice(1);
      expect(tableLines[0]).toContain("ID");
      expect(tableLines[0]).toContain("Common Name");
      expect(tableLines[1]).toMatch(/^-+$/);
    }

    // example.com: header + separator + 3 rows = 5 lines after domain header
    const comLines = sections[0].split("\n").slice(1);
    expect(comLines).toHaveLength(5);

    // example.org: header + separator + 2 rows = 4 lines after domain header
    const orgLines = sections[1].split("\n").slice(1);
    expect(orgLines).toHaveLength(4);
  });

  test("searchMultipleDomains → formatMultiDomainResults with formatCsv", async () => {
    const data = new Map([
      ["example.com", exampleComEntries],
      ["example.org", exampleOrgEntries],
    ]);
    const searchFn = makeSearchFn(data);

    const { results, errors } = await searchMultipleDomains(
      ["example.com", "example.org"],
      { delayMs: 0, searchFn },
    );

    const output = formatMultiDomainResults(results, errors, formatCsv);

    expect(output).toContain("=== example.com ===");
    expect(output).toContain("=== example.org ===");

    // CSV headers should appear under each domain section
    expect(output).toContain("issuer_ca_id,issuer_name,common_name");
  });

  test("partial failure includes both results and errors in output", async () => {
    const data = new Map([["example.com", exampleComEntries]]);
    const failDomains = new Map([
      ["fail.com", new CrtShError("server unavailable", "SERVER_ERROR")],
    ]);
    const searchFn = makeSearchFn(data, failDomains);

    const { results, errors } = await searchMultipleDomains(
      ["example.com", "fail.com"],
      { delayMs: 0, searchFn },
    );

    const output = formatMultiDomainJson(results, errors);
    const parsed = JSON.parse(output);

    expect(parsed["example.com"].entries).toHaveLength(3);
    expect(parsed["fail.com"].error).toBe("server unavailable");
    expect(parsed["fail.com"].code).toBe("SERVER_ERROR");
  });

  test("dedupe works across multi-domain results", async () => {
    // Add a duplicate serial number within example.com entries
    const comWithDupe: CrtShEntry[] = [
      ...exampleComEntries,
      {
        ...exampleComEntries[0],
        id: 9999999999,
        common_name: "duplicate.example.com",
        // Same serial_number as first entry
      },
    ];

    const data = new Map([
      ["example.com", comWithDupe],
      ["example.org", exampleOrgEntries],
    ]);
    const searchFn = makeSearchFn(data);

    const { results } = await searchMultipleDomains(
      ["example.com", "example.org"],
      { delayMs: 0, searchFn },
    );

    // Before dedupe: example.com has 4 entries
    expect(results.get("example.com")).toHaveLength(4);

    // Apply dedupe per domain (as the CLI does)
    const dedupedCom = dedupeBySerial(results.get("example.com")!);
    const dedupedOrg = dedupeBySerial(results.get("example.org")!);

    // After dedupe: duplicate serial removed
    expect(dedupedCom).toHaveLength(3);
    expect(dedupedOrg).toHaveLength(2);
  });
});
