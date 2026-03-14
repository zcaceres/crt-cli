import { describe, expect, test } from "bun:test";
import { CrtShEntrySchema, CrtShResponseSchema } from "../src/schemas";
import { buildUrl, dedupeBySerial, extractSubdomains } from "../src/api";
import fixture from "../fixtures/example-com.json";

describe("CrtShResponseSchema", () => {
  test("validates real fixture data", () => {
    const result = CrtShResponseSchema.safeParse(fixture);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.length).toBeGreaterThan(0);
    }
  });

  test("validates a single entry from fixture", () => {
    const entry = (fixture as unknown[])[0];
    const result = CrtShEntrySchema.safeParse(entry);
    expect(result.success).toBe(true);
  });

  test("rejects invalid entry", () => {
    const result = CrtShEntrySchema.safeParse({ id: "not-a-number" });
    expect(result.success).toBe(false);
  });
});

describe("buildUrl", () => {
  test("builds basic URL", () => {
    const url = buildUrl("example.com");
    expect(url).toContain("q=example.com");
    expect(url).toContain("output=json");
  });

  test("builds wildcard URL", () => {
    const url = buildUrl("example.com", { wildcard: true });
    expect(url).toContain("q=%25.example.com");
  });

  test("builds URL with exclude expired", () => {
    const url = buildUrl("example.com", { excludeExpired: true });
    expect(url).toContain("exclude=expired");
  });
});

describe("extractSubdomains", () => {
  test("extracts unique subdomains from entries", () => {
    const entries = [
      {
        issuer_ca_id: 1,
        issuer_name: "Test CA",
        common_name: "example.com",
        name_value: "example.com\nwww.example.com",
        id: 1,
        entry_timestamp: null,
        not_before: "2024-01-01",
        not_after: "2025-01-01",
        serial_number: "abc123",
        result_count: 1,
      },
      {
        issuer_ca_id: 1,
        issuer_name: "Test CA",
        common_name: "mail.example.com",
        name_value: "mail.example.com\nwww.example.com",
        id: 2,
        entry_timestamp: null,
        not_before: "2024-01-01",
        not_after: "2025-01-01",
        serial_number: "def456",
        result_count: 1,
      },
    ];

    const subs = extractSubdomains(entries);
    expect(subs).toEqual([
      "example.com",
      "mail.example.com",
      "www.example.com",
    ]);
  });

  test("extracts subdomains from real fixture", () => {
    const parsed = CrtShResponseSchema.parse(fixture);
    const subs = extractSubdomains(parsed);
    expect(subs.length).toBeGreaterThan(0);
    expect(subs.every((s) => s.includes("example"))).toBe(true);
  });
});

describe("dedupeBySerial", () => {
  test("removes duplicate serial numbers", () => {
    const entries = [
      {
        issuer_ca_id: 1,
        issuer_name: "CA",
        common_name: "a.com",
        name_value: "a.com",
        id: 1,
        entry_timestamp: null,
        not_before: "2024-01-01",
        not_after: "2025-01-01",
        serial_number: "aaa",
        result_count: 1,
      },
      {
        issuer_ca_id: 1,
        issuer_name: "CA",
        common_name: "a.com",
        name_value: "a.com",
        id: 2,
        entry_timestamp: null,
        not_before: "2024-01-01",
        not_after: "2025-01-01",
        serial_number: "aaa",
        result_count: 1,
      },
      {
        issuer_ca_id: 1,
        issuer_name: "CA",
        common_name: "b.com",
        name_value: "b.com",
        id: 3,
        entry_timestamp: null,
        not_before: "2024-01-01",
        not_after: "2025-01-01",
        serial_number: "bbb",
        result_count: 1,
      },
    ];

    const deduped = dedupeBySerial(entries);
    expect(deduped).toHaveLength(2);
    expect(deduped[0].id).toBe(1);
    expect(deduped[1].id).toBe(3);
  });
});
