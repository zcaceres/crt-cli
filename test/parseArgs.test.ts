import { describe, expect, test } from "bun:test";
import { parseArgs } from "../src/index";

describe("parseArgs", () => {
  describe("positional arguments", () => {
    test("extracts command and domain", () => {
      const { positional } = parseArgs(["search", "example.com"]);
      expect(positional).toEqual(["search", "example.com"]);
    });

    test("returns empty positional for no args", () => {
      const { positional } = parseArgs([]);
      expect(positional).toEqual([]);
    });

    test("handles only a command", () => {
      const { positional } = parseArgs(["search"]);
      expect(positional).toEqual(["search"]);
    });
  });

  describe("boolean flags", () => {
    test("parses --wildcard", () => {
      const { flags } = parseArgs(["search", "example.com", "--wildcard"]);
      expect(flags.wildcard).toBe(true);
    });

    test("parses -w alias", () => {
      const { flags } = parseArgs(["search", "example.com", "-w"]);
      expect(flags.wildcard).toBe(true);
    });

    test("parses --exclude-expired", () => {
      const { flags } = parseArgs(["search", "example.com", "--exclude-expired"]);
      expect(flags.excludeExpired).toBe(true);
    });

    test("parses -e alias", () => {
      const { flags } = parseArgs(["search", "example.com", "-e"]);
      expect(flags.excludeExpired).toBe(true);
    });

    test("parses --dedupe", () => {
      const { flags } = parseArgs(["search", "example.com", "--dedupe"]);
      expect(flags.dedupe).toBe(true);
    });

    test("parses -d alias", () => {
      const { flags } = parseArgs(["search", "example.com", "-d"]);
      expect(flags.dedupe).toBe(true);
    });

    test("parses --help", () => {
      const { flags } = parseArgs(["--help"]);
      expect(flags.help).toBe(true);
    });

    test("parses -h alias", () => {
      const { flags } = parseArgs(["-h"]);
      expect(flags.help).toBe(true);
    });

    test("parses --describe", () => {
      const { flags } = parseArgs(["--describe"]);
      expect(flags.describe).toBe(true);
    });

    test("parses multiple flags together", () => {
      const { flags } = parseArgs(["search", "example.com", "-w", "-e", "-d"]);
      expect(flags.wildcard).toBe(true);
      expect(flags.excludeExpired).toBe(true);
      expect(flags.dedupe).toBe(true);
    });
  });

  describe("--format flag", () => {
    test("parses --format with value", () => {
      const { flags } = parseArgs(["search", "example.com", "--format", "table"]);
      expect(flags.format).toBe("table");
    });

    test("parses -f alias with value", () => {
      const { flags } = parseArgs(["search", "example.com", "-f", "subdomains"]);
      expect(flags.format).toBe("subdomains");
    });
  });

  describe("flags before command", () => {
    test("flags can appear before positional args", () => {
      const { flags, positional } = parseArgs(["-w", "-e", "search", "example.com"]);
      expect(flags.wildcard).toBe(true);
      expect(flags.excludeExpired).toBe(true);
      expect(positional).toEqual(["search", "example.com"]);
    });

    test("only flags, no command produces empty positional", () => {
      const { flags, positional } = parseArgs(["-w", "-e", "-d"]);
      expect(flags.wildcard).toBe(true);
      expect(flags.excludeExpired).toBe(true);
      expect(flags.dedupe).toBe(true);
      expect(positional).toEqual([]);
    });
  });

  describe("-- end-of-flags", () => {
    test("stops flag parsing at --", () => {
      const { flags, positional } = parseArgs(["search", "--", "--weird-domain.com"]);
      expect(positional).toEqual(["search", "--weird-domain.com"]);
      expect(flags.wildcard).toBeUndefined();
    });

    test("treats everything after -- as positional", () => {
      const { positional } = parseArgs(["search", "--", "-w", "example.com"]);
      expect(positional).toEqual(["search", "-w", "example.com"]);
    });

    test("-- with no following args", () => {
      const { positional } = parseArgs(["search", "--"]);
      expect(positional).toEqual(["search"]);
    });

    test("flags before -- are still parsed", () => {
      const { flags, positional } = parseArgs(["-w", "search", "--", "example.com"]);
      expect(flags.wildcard).toBe(true);
      expect(positional).toEqual(["search", "example.com"]);
    });
  });

  describe("negative numbers as positional", () => {
    test("negative number is treated as positional, not a flag", () => {
      const { positional } = parseArgs(["cert", "-123"]);
      expect(positional).toEqual(["cert", "-123"]);
    });
  });

  describe("unknown flags cause process.exit", () => {
    test("unknown long flag exits", () => {
      // parseArgs calls process.exit(1) for unknown flags
      // We test this via CLI integration tests instead
    });
  });
});
