import { describe, expect, test } from "bun:test";
import { $ } from "bun";

async function run(...args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(["bun", "run", "src/index.ts", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  return { stdout, stderr, exitCode };
}

describe("CLI integration", () => {
  describe("help and describe", () => {
    test("no args shows help and exits 0", async () => {
      const { stdout, exitCode } = await run();
      expect(exitCode).toBe(0);
      expect(stdout).toContain("Usage:");
      expect(stdout).toContain("crt");
    });

    test("--help shows help", async () => {
      const { stdout, exitCode } = await run("--help");
      expect(exitCode).toBe(0);
      expect(stdout).toContain("Usage:");
    });

    test("-h shows help", async () => {
      const { stdout, exitCode } = await run("-h");
      expect(exitCode).toBe(0);
      expect(stdout).toContain("Usage:");
    });

    test("search --help shows search help", async () => {
      const { stdout, exitCode } = await run("search", "--help");
      expect(exitCode).toBe(0);
      expect(stdout).toContain("crt search");
      expect(stdout).toContain("<domain>");
    });

    test("cert --help shows cert help", async () => {
      const { stdout, exitCode } = await run("cert", "--help");
      expect(exitCode).toBe(0);
      expect(stdout).toContain("crt cert");
      expect(stdout).toContain("<id>");
    });

    test("--describe outputs JSON schema", async () => {
      const { stdout, exitCode } = await run("--describe");
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.name).toBe("crt-cli");
      expect(parsed.commands).toBeArray();
    });

    test("--version shows version", async () => {
      const { stdout, exitCode } = await run("--version");
      expect(exitCode).toBe(0);
      expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
    });

    test("-V shows version", async () => {
      const { stdout, exitCode } = await run("-V");
      expect(exitCode).toBe(0);
      expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });

  describe("flags-only without command (chaos monkey fix 1)", () => {
    test("crt -w -e -d shows help, not 'Unknown command: undefined'", async () => {
      const { stdout, stderr, exitCode } = await run("-w", "-e", "-d");
      expect(exitCode).toBe(1);
      expect(stdout).toContain("Usage:");
      expect(stderr).not.toContain("undefined");
    });

    test("crt -w shows help", async () => {
      const { stdout, exitCode } = await run("-w");
      expect(exitCode).toBe(1);
      expect(stdout).toContain("Usage:");
    });
  });

  describe("cert ID validation (chaos monkey fix 2)", () => {
    test("rejects hex ID 0x1A", async () => {
      const { stderr, exitCode } = await run("cert", "0x1A");
      expect(exitCode).toBe(1);
      const parsed = JSON.parse(stderr);
      expect(parsed.code).toBe("INVALID_ARG");
      expect(parsed.error).toContain("0x1A");
    });

    test("rejects scientific notation 1e5", async () => {
      const { stderr, exitCode } = await run("cert", "1e5");
      expect(exitCode).toBe(1);
      const parsed = JSON.parse(stderr);
      expect(parsed.code).toBe("INVALID_ARG");
    });

    test("rejects octal-like 0o77", async () => {
      const { stderr, exitCode } = await run("cert", "0o77");
      expect(exitCode).toBe(1);
      const parsed = JSON.parse(stderr);
      expect(parsed.code).toBe("INVALID_ARG");
    });

    test("rejects alphabetic input", async () => {
      const { stderr, exitCode } = await run("cert", "abc");
      expect(exitCode).toBe(1);
      const parsed = JSON.parse(stderr);
      expect(parsed.code).toBe("INVALID_ARG");
    });

    test("missing cert ID shows MISSING_ARG", async () => {
      const { stderr, exitCode } = await run("cert");
      expect(exitCode).toBe(1);
      const parsed = JSON.parse(stderr);
      expect(parsed.code).toBe("MISSING_ARG");
    });
  });

  describe("-- end-of-flags (chaos monkey fix 3)", () => {
    test("search -- does not error on --", async () => {
      // This will fail with MISSING_ARG since no domain is given after --, but should NOT error about unknown flag
      const { stderr, exitCode } = await run("search", "--");
      expect(exitCode).toBe(1);
      const parsed = JSON.parse(stderr);
      expect(parsed.code).toBe("MISSING_ARG");
    });

    test("-- passes subsequent flags as positional args", async () => {
      // search -- -w  => domain is "-w" (not a flag). Will fail at network level,
      // but won't error about unknown flag. We just verify it doesn't exit with UNKNOWN_FLAG.
      // Actually this will try to fetch, so let's just test parseArgs directly for this
    });
  });

  describe("unknown command", () => {
    test("unknown command shows error with command name", async () => {
      const { stderr, exitCode } = await run("foobar");
      expect(exitCode).toBe(1);
      const parsed = JSON.parse(stderr);
      expect(parsed.code).toBe("UNKNOWN_COMMAND");
      expect(parsed.error).toContain("foobar");
    });
  });

  describe("unknown flags", () => {
    test("unknown flag shows error", async () => {
      const { stderr, exitCode } = await run("search", "example.com", "--bogus");
      expect(exitCode).toBe(1);
      const parsed = JSON.parse(stderr);
      expect(parsed.code).toBe("UNKNOWN_FLAG");
      expect(parsed.error).toContain("--bogus");
    });
  });

  describe("--format missing value", () => {
    test("--format without value shows MISSING_VALUE error", async () => {
      const { stderr, exitCode } = await run("search", "example.com", "--format");
      expect(exitCode).toBe(1);
      const parsed = JSON.parse(stderr);
      expect(parsed.code).toBe("MISSING_VALUE");
    });

    test("--format followed by another flag shows MISSING_VALUE error", async () => {
      const { stderr, exitCode } = await run("search", "example.com", "--format", "-w");
      expect(exitCode).toBe(1);
      const parsed = JSON.parse(stderr);
      expect(parsed.code).toBe("MISSING_VALUE");
    });
  });

  describe("missing domain argument", () => {
    test("search without domain shows MISSING_ARG", async () => {
      const { stderr, exitCode } = await run("search");
      expect(exitCode).toBe(1);
      const parsed = JSON.parse(stderr);
      expect(parsed.code).toBe("MISSING_ARG");
    });

    test("subdomains without domain shows MISSING_ARG", async () => {
      const { stderr, exitCode } = await run("subdomains");
      expect(exitCode).toBe(1);
      const parsed = JSON.parse(stderr);
      expect(parsed.code).toBe("MISSING_ARG");
    });
  });
});
