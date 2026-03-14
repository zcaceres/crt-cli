import { describe, expect, test } from "bun:test";
import {
  searchCertificates,
  dedupeBySerial,
  extractSubdomains,
  buildUrl,
  CrtShError,
  validateCertId,
  formatJson,
  formatTable,
  formatSubdomains,
  formatError,
  CrtShEntrySchema,
  CrtShResponseSchema,
} from "../src/lib";
import type { CrtShEntry, CrtShResponse } from "../src/lib";

describe("lib barrel export", () => {
  test("exports all API functions", () => {
    expect(typeof searchCertificates).toBe("function");
    expect(typeof dedupeBySerial).toBe("function");
    expect(typeof extractSubdomains).toBe("function");
    expect(typeof buildUrl).toBe("function");
    expect(typeof validateCertId).toBe("function");
  });

  test("exports CrtShError class", () => {
    const err = new CrtShError("test", "TEST_CODE");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(CrtShError);
    expect(err.message).toBe("test");
    expect(err.code).toBe("TEST_CODE");
  });

  test("exports all format functions", () => {
    expect(typeof formatJson).toBe("function");
    expect(typeof formatTable).toBe("function");
    expect(typeof formatSubdomains).toBe("function");
    expect(typeof formatError).toBe("function");
  });

  test("exports Zod schemas", () => {
    expect(CrtShEntrySchema).toBeDefined();
    expect(CrtShResponseSchema).toBeDefined();
    expect(typeof CrtShEntrySchema.safeParse).toBe("function");
  });

  test("exported types work with schemas", () => {
    const entry: CrtShEntry = {
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
    };
    const result = CrtShEntrySchema.safeParse(entry);
    expect(result.success).toBe(true);
  });

  test("exported functions produce correct results", () => {
    const entry: CrtShEntry = {
      issuer_ca_id: 1,
      issuer_name: "Test CA",
      common_name: "example.com",
      name_value: "a.example.com\nb.example.com",
      id: 1,
      entry_timestamp: null,
      not_before: "2024-01-01",
      not_after: "2025-01-01",
      serial_number: "abc123",
      result_count: 1,
    };

    expect(JSON.parse(formatJson([entry]))).toHaveLength(1);
    expect(extractSubdomains([entry])).toEqual(["a.example.com", "b.example.com"]);
    expect(buildUrl("example.com")).toContain("crt.sh");
    expect(validateCertId("123")).toEqual({ valid: true, certId: 123 });
  });
});
