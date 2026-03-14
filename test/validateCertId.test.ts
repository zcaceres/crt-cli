import { describe, expect, test } from "bun:test";
import { validateCertId } from "../src/api";

describe("validateCertId", () => {
  describe("valid IDs", () => {
    test("accepts simple integer string", () => {
      const result = validateCertId("12345678");
      expect(result).toEqual({ valid: true, certId: 12345678 });
    });

    test("accepts single digit", () => {
      const result = validateCertId("1");
      expect(result).toEqual({ valid: true, certId: 1 });
    });

    test("accepts large valid ID", () => {
      const result = validateCertId("999999999");
      expect(result).toEqual({ valid: true, certId: 999999999 });
    });
  });

  describe("rejects hex/octal/scientific notation", () => {
    test("rejects hex string 0x1A", () => {
      const result = validateCertId("0x1A");
      expect(result.valid).toBe(false);
    });

    test("rejects hex string 0xFF", () => {
      const result = validateCertId("0xFF");
      expect(result.valid).toBe(false);
    });

    test("rejects scientific notation 1e5", () => {
      const result = validateCertId("1e5");
      expect(result.valid).toBe(false);
    });

    test("rejects scientific notation 2E10", () => {
      const result = validateCertId("2E10");
      expect(result.valid).toBe(false);
    });

    test("rejects octal-style 0o77", () => {
      const result = validateCertId("0o77");
      expect(result.valid).toBe(false);
    });

    test("rejects binary-style 0b1010", () => {
      const result = validateCertId("0b1010");
      expect(result.valid).toBe(false);
    });
  });

  describe("rejects non-numeric input", () => {
    test("rejects alphabetic string", () => {
      const result = validateCertId("abc");
      expect(result.valid).toBe(false);
    });

    test("rejects empty string", () => {
      const result = validateCertId("");
      expect(result.valid).toBe(false);
    });

    test("rejects string with spaces", () => {
      const result = validateCertId("123 456");
      expect(result.valid).toBe(false);
    });

    test("rejects negative number string", () => {
      const result = validateCertId("-1");
      expect(result.valid).toBe(false);
    });

    test("rejects decimal number", () => {
      const result = validateCertId("12.5");
      expect(result.valid).toBe(false);
    });

    test("rejects zero", () => {
      const result = validateCertId("0");
      expect(result.valid).toBe(false);
    });

    test("rejects leading plus sign", () => {
      const result = validateCertId("+123");
      expect(result.valid).toBe(false);
    });

    test("rejects number with trailing text", () => {
      const result = validateCertId("123abc");
      expect(result.valid).toBe(false);
    });

    test("rejects number with leading text", () => {
      const result = validateCertId("abc123");
      expect(result.valid).toBe(false);
    });
  });

  describe("error messages", () => {
    test("includes the invalid input in the reason", () => {
      const result = validateCertId("0x1A");
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toContain("0x1A");
      }
    });
  });
});
