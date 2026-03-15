import { describe, expect, mock, test } from "bun:test";
import {
  buildUrl,
  CrtShError,
  searchMultipleDomains,
  validateDomain,
} from "../src/api";
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

describe("buildUrl", () => {
  test("builds basic query URL", () => {
    const url = buildUrl("example.com");
    expect(url).toBe("https://crt.sh/?q=example.com&output=json");
  });

  test("adds wildcard prefix", () => {
    const url = buildUrl("example.com", { wildcard: true });
    expect(url).toContain("q=%25.example.com");
  });

  test("does not double-prefix when query already has %.", () => {
    const url = buildUrl("%.example.com", { wildcard: true });
    // Should contain %.example.com (url-encoded as %25.example.com), not %.%.example.com
    const params = new URL(url).searchParams;
    expect(params.get("q")).toBe("%.example.com");
  });

  test("does not add wildcard prefix when wildcard is false", () => {
    const url = buildUrl("example.com", { wildcard: false });
    const params = new URL(url).searchParams;
    expect(params.get("q")).toBe("example.com");
  });

  test("does not add wildcard prefix when options are omitted", () => {
    const url = buildUrl("example.com");
    const params = new URL(url).searchParams;
    expect(params.get("q")).toBe("example.com");
  });

  test("adds exclude=expired when excludeExpired is true", () => {
    const url = buildUrl("example.com", { excludeExpired: true });
    const params = new URL(url).searchParams;
    expect(params.get("exclude")).toBe("expired");
  });

  test("does not add exclude param when excludeExpired is false", () => {
    const url = buildUrl("example.com", { excludeExpired: false });
    const params = new URL(url).searchParams;
    expect(params.get("exclude")).toBeNull();
  });

  test("combines wildcard and excludeExpired", () => {
    const url = buildUrl("example.com", {
      wildcard: true,
      excludeExpired: true,
    });
    const params = new URL(url).searchParams;
    expect(params.get("q")).toBe("%.example.com");
    expect(params.get("exclude")).toBe("expired");
  });

  test("always includes output=json", () => {
    const url = buildUrl("anything");
    const params = new URL(url).searchParams;
    expect(params.get("output")).toBe("json");
  });
});

describe("searchMultipleDomains", () => {
  test("returns results for multiple domains", async () => {
    const entry1 = makeEntry({ common_name: "a.com", id: 1 });
    const entry2 = makeEntry({ common_name: "b.com", id: 2 });

    const mockSearch = mock(async (query: string) => {
      if (query === "a.com") return [entry1];
      return [entry2];
    }) as typeof import("../src/api").searchCertificates;

    const { results, errors } = await searchMultipleDomains(
      ["a.com", "b.com"],
      {
        delayMs: 0,
        searchFn: mockSearch,
      },
    );

    expect(results.size).toBe(2);
    expect(results.get("a.com")).toHaveLength(1);
    expect(results.get("b.com")).toHaveLength(1);
    expect(errors.size).toBe(0);
  });

  test("handles partial failure", async () => {
    const entry1 = makeEntry({ common_name: "a.com" });

    const mockSearch = mock(async (query: string) => {
      if (query === "a.com") return [entry1];
      throw new CrtShError("server error", "SERVER_ERROR");
    }) as typeof import("../src/api").searchCertificates;

    const { results, errors } = await searchMultipleDomains(
      ["a.com", "b.com"],
      {
        delayMs: 0,
        searchFn: mockSearch,
      },
    );

    expect(results.size).toBe(1);
    expect(results.has("a.com")).toBe(true);
    expect(errors.size).toBe(1);
    expect(errors.has("b.com")).toBe(true);
  });

  test("returns empty maps for empty domain array", async () => {
    const { results, errors } = await searchMultipleDomains([]);
    expect(results.size).toBe(0);
    expect(errors.size).toBe(0);
  });
});

describe("validateDomain", () => {
  test("accepts valid domains", () => {
    expect(validateDomain("example.com")).toEqual({ valid: true });
    expect(validateDomain("sub.example.com")).toEqual({ valid: true });
    expect(validateDomain("my-site.co.uk")).toEqual({ valid: true });
  });

  test("accepts wildcard patterns", () => {
    expect(validateDomain("%.example.com")).toEqual({ valid: true });
    expect(validateDomain("*.example.com")).toEqual({ valid: true });
  });

  test("rejects empty string", () => {
    const result = validateDomain("");
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toContain("empty");
  });

  test("rejects domain without dots", () => {
    const result = validateDomain("localhost");
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toContain("dot");
  });

  test("rejects domain with spaces", () => {
    const result = validateDomain("example .com");
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toContain("invalid characters");
  });

  test("rejects overly long domain", () => {
    const long = `${"a".repeat(250)}.com`;
    const result = validateDomain(long);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.reason).toContain("too long");
  });
});
