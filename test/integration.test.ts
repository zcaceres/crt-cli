import { describe, expect, test } from "bun:test";
import { extractSubdomains, searchCertificates } from "../src/api";

const INTEGRATION = !!process.env.INTEGRATION;

describe.skipIf(!INTEGRATION)("integration tests (real crt.sh)", () => {
  test("API schema validation — searchCertificates returns expected fields", async () => {
    const results = await searchCertificates("example.com");
    expect(results.length).toBeGreaterThan(0);

    const entry = results[0];
    expect(entry).toHaveProperty("id");
    expect(entry).toHaveProperty("issuer_ca_id");
    expect(entry).toHaveProperty("issuer_name");
    expect(entry).toHaveProperty("common_name");
    expect(entry).toHaveProperty("name_value");
    expect(entry).toHaveProperty("serial_number");
    expect(entry).toHaveProperty("not_before");
    expect(entry).toHaveProperty("not_after");
    expect(entry).toHaveProperty("entry_timestamp");
  }, 60_000);

  test("wildcard search returns results", async () => {
    const results = await searchCertificates("example.com", { wildcard: true });
    expect(results.length).toBeGreaterThan(0);
  }, 60_000);

  test("subdomain extraction includes www.example.com", async () => {
    const results = await searchCertificates("example.com", { wildcard: true });
    const subdomains = extractSubdomains(results);
    expect(subdomains).toContain("www.example.com");
  }, 60_000);

  test("CLI E2E — search example.com exits 0 with valid JSON", async () => {
    const proc = Bun.spawn(
      ["bun", "run", "src/index.ts", "search", "example.com"],
      {
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(Array.isArray(parsed)).toBe(true);
  }, 60_000);
});
