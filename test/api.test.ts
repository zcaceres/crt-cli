import { describe, expect, test } from "bun:test";
import { buildUrl } from "../src/api";

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
    const url = buildUrl("example.com", { wildcard: true, excludeExpired: true });
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

