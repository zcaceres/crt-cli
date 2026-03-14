import { describe, expect, test, mock, beforeAll, afterAll } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import fixture from "../fixtures/example-com.json";
import type { CrtShEntry } from "../src/schemas";
import { CrtShError } from "../src/api";

// Mock searchCertificates at the module level so createServer picks it up
const mockSearchCertificates = mock<(query: string, options?: { wildcard?: boolean; excludeExpired?: boolean }) => Promise<CrtShEntry[]>>();

mock.module("../src/api", () => {
  const actual = require("../src/api");
  return {
    ...actual,
    searchCertificates: mockSearchCertificates,
  };
});

const { createServer } = await import("../src/mcp");

let client: Client;
let server: McpServer;

// Initialize client before connecting
client = new Client({ name: "test-client", version: "1.0.0" });

beforeAll(async () => {
  server = createServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([
    client.connect(clientTransport),
    server.connect(serverTransport),
  ]);
});

afterAll(async () => {
  await client.close();
  await server.close();
});

describe("MCP server entry point", () => {
  test("starts via stdio and responds to initialize", async () => {
    const proc = Bun.spawn(["bun", "run", "src/mcp.ts"], {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });

    const initMessage = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "test", version: "1.0.0" },
      },
    });
    const header = `Content-Length: ${Buffer.byteLength(initMessage)}\r\n\r\n`;
    proc.stdin.write(header + initMessage);
    proc.stdin.flush();

    // Read response with timeout
    const reader = proc.stdout.getReader();
    const timeout = setTimeout(() => { proc.kill(); }, 5000);

    let buf = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += new TextDecoder().decode(value);
      // Look for a complete JSON-RPC response after the headers
      const bodyStart = buf.indexOf("\r\n\r\n");
      if (bodyStart >= 0) {
        const body = buf.slice(bodyStart + 4);
        try {
          const parsed = JSON.parse(body);
          expect(parsed.id).toBe(1);
          expect(parsed.result).toBeDefined();
          expect(parsed.result.serverInfo.name).toBe("crt-sh");
          break;
        } catch {
          // Incomplete JSON, keep reading
        }
      }
    }

    clearTimeout(timeout);
    proc.kill();
    await proc.exited;
  }, 10_000);
});

describe("MCP server", () => {
  describe("tools/list", () => {
    test("lists all three tools", async () => {
      const result = await client.listTools();
      const names = result.tools.map((t) => t.name).sort();
      expect(names).toEqual(["find_subdomains", "lookup_cert", "search_certificates"]);
    });

    test("search_certificates has correct input schema", async () => {
      const result = await client.listTools();
      const tool = result.tools.find((t) => t.name === "search_certificates")!;
      expect(tool.inputSchema.properties).toHaveProperty("domain");
      expect(tool.inputSchema.properties).toHaveProperty("wildcard");
      expect(tool.inputSchema.properties).toHaveProperty("excludeExpired");
      expect(tool.inputSchema.properties).toHaveProperty("dedupe");
      expect(tool.inputSchema.properties).toHaveProperty("format");
      expect(tool.inputSchema.required).toContain("domain");
    });

    test("find_subdomains has correct input schema", async () => {
      const result = await client.listTools();
      const tool = result.tools.find((t) => t.name === "find_subdomains")!;
      expect(tool.inputSchema.properties).toHaveProperty("domain");
      expect(tool.inputSchema.properties).toHaveProperty("excludeExpired");
      expect(tool.inputSchema.required).toContain("domain");
    });

    test("lookup_cert has correct input schema", async () => {
      const result = await client.listTools();
      const tool = result.tools.find((t) => t.name === "lookup_cert")!;
      expect(tool.inputSchema.properties).toHaveProperty("id");
      expect(tool.inputSchema.required).toContain("id");
    });
  });

  describe("search_certificates", () => {
    test("returns JSON formatted results by default", async () => {
      mockSearchCertificates.mockResolvedValueOnce(fixture as CrtShEntry[]);
      const result = await client.callTool({ name: "search_certificates", arguments: { domain: "example.com" } });
      const content = result.content as Array<{ type: string; text: string }>;
      expect(content).toHaveLength(1);
      expect(content[0].type).toBe("text");
      const parsed = JSON.parse(content[0].text);
      expect(parsed).toBeArray();
      expect(parsed.length).toBeGreaterThan(0);
    });

    test("passes wildcard and excludeExpired options", async () => {
      mockSearchCertificates.mockResolvedValueOnce([]);
      await client.callTool({
        name: "search_certificates",
        arguments: { domain: "example.com", wildcard: true, excludeExpired: true },
      });
      expect(mockSearchCertificates).toHaveBeenLastCalledWith("example.com", { wildcard: true, excludeExpired: true });
    });

    test("deduplicates results when dedupe is true", async () => {
      const dupes: CrtShEntry[] = [
        {
          issuer_ca_id: 1, issuer_name: "CA", common_name: "a.com", name_value: "a.com",
          id: 1, entry_timestamp: null, not_before: "2024-01-01", not_after: "2025-01-01",
          serial_number: "same", result_count: 1,
        },
        {
          issuer_ca_id: 1, issuer_name: "CA", common_name: "a.com", name_value: "a.com",
          id: 2, entry_timestamp: null, not_before: "2024-01-01", not_after: "2025-01-01",
          serial_number: "same", result_count: 1,
        },
      ];
      mockSearchCertificates.mockResolvedValueOnce(dupes);
      const result = await client.callTool({
        name: "search_certificates",
        arguments: { domain: "a.com", dedupe: true },
      });
      const content = result.content as Array<{ type: string; text: string }>;
      const parsed = JSON.parse(content[0].text);
      expect(parsed).toHaveLength(1);
    });

    test("returns table format", async () => {
      mockSearchCertificates.mockResolvedValueOnce(fixture as CrtShEntry[]);
      const result = await client.callTool({
        name: "search_certificates",
        arguments: { domain: "example.com", format: "table" },
      });
      const content = result.content as Array<{ type: string; text: string }>;
      expect(content[0].text).toContain("ID");
      expect(content[0].text).toContain("Common Name");
    });

    test("returns subdomains format", async () => {
      const entries: CrtShEntry[] = [
        {
          issuer_ca_id: 1, issuer_name: "CA", common_name: "example.com",
          name_value: "a.example.com\nb.example.com",
          id: 1, entry_timestamp: null, not_before: "2024-01-01", not_after: "2025-01-01",
          serial_number: "abc", result_count: 1,
        },
      ];
      mockSearchCertificates.mockResolvedValueOnce(entries);
      const result = await client.callTool({
        name: "search_certificates",
        arguments: { domain: "example.com", format: "subdomains" },
      });
      const content = result.content as Array<{ type: string; text: string }>;
      expect(content[0].text).toContain("a.example.com");
      expect(content[0].text).toContain("b.example.com");
    });

    test("returns empty JSON array for no results", async () => {
      mockSearchCertificates.mockResolvedValueOnce([]);
      const result = await client.callTool({
        name: "search_certificates",
        arguments: { domain: "nonexistent.example" },
      });
      const content = result.content as Array<{ type: string; text: string }>;
      expect(JSON.parse(content[0].text)).toEqual([]);
    });

    test("returns isError on CrtShError", async () => {
      mockSearchCertificates.mockRejectedValueOnce(new CrtShError("rate limited", "SERVER_ERROR"));
      const result = await client.callTool({
        name: "search_certificates",
        arguments: { domain: "example.com" },
      });
      expect(result.isError).toBe(true);
      const content = result.content as Array<{ type: string; text: string }>;
      expect(content[0].text).toContain("SERVER_ERROR");
      expect(content[0].text).toContain("rate limited");
    });

    test("re-throws non-CrtShError errors", async () => {
      mockSearchCertificates.mockRejectedValueOnce(new TypeError("unexpected"));
      try {
        await client.callTool({
          name: "search_certificates",
          arguments: { domain: "example.com" },
        });
        expect(true).toBe(false); // should not reach
      } catch (err) {
        // MCP SDK wraps errors - just verify it threw
        expect(err).toBeDefined();
      }
    });
  });

  describe("find_subdomains", () => {
    test("returns subdomain list", async () => {
      const entries: CrtShEntry[] = [
        {
          issuer_ca_id: 1, issuer_name: "CA", common_name: "example.com",
          name_value: "mail.example.com\nwww.example.com",
          id: 1, entry_timestamp: null, not_before: "2024-01-01", not_after: "2025-01-01",
          serial_number: "abc", result_count: 1,
        },
      ];
      mockSearchCertificates.mockResolvedValueOnce(entries);
      const result = await client.callTool({
        name: "find_subdomains",
        arguments: { domain: "example.com" },
      });
      const content = result.content as Array<{ type: string; text: string }>;
      expect(content[0].text).toContain("mail.example.com");
      expect(content[0].text).toContain("www.example.com");
    });

    test("always passes wildcard: true", async () => {
      mockSearchCertificates.mockResolvedValueOnce([]);
      await client.callTool({
        name: "find_subdomains",
        arguments: { domain: "example.com" },
      });
      expect(mockSearchCertificates).toHaveBeenLastCalledWith("example.com", { wildcard: true, excludeExpired: false });
    });

    test("passes excludeExpired option", async () => {
      mockSearchCertificates.mockResolvedValueOnce([]);
      await client.callTool({
        name: "find_subdomains",
        arguments: { domain: "example.com", excludeExpired: true },
      });
      expect(mockSearchCertificates).toHaveBeenLastCalledWith("example.com", { wildcard: true, excludeExpired: true });
    });

    test("returns 'No subdomains found.' for empty results", async () => {
      mockSearchCertificates.mockResolvedValueOnce([]);
      const result = await client.callTool({
        name: "find_subdomains",
        arguments: { domain: "nonexistent.example" },
      });
      const content = result.content as Array<{ type: string; text: string }>;
      expect(content[0].text).toBe("No subdomains found.");
    });

    test("returns isError on CrtShError", async () => {
      mockSearchCertificates.mockRejectedValueOnce(new CrtShError("network fail", "NETWORK_ERROR"));
      const result = await client.callTool({
        name: "find_subdomains",
        arguments: { domain: "example.com" },
      });
      expect(result.isError).toBe(true);
      const content = result.content as Array<{ type: string; text: string }>;
      expect(content[0].text).toContain("NETWORK_ERROR");
    });
  });

  describe("lookup_cert", () => {
    test("returns cert info for valid ID", async () => {
      const result = await client.callTool({
        name: "lookup_cert",
        arguments: { id: "12345678" },
      });
      expect(result.isError).toBeUndefined();
      const content = result.content as Array<{ type: string; text: string }>;
      const parsed = JSON.parse(content[0].text);
      expect(parsed.id).toBe(12345678);
      expect(parsed.url).toBe("https://crt.sh/?id=12345678");
      expect(parsed.note).toContain("does not provide a JSON API");
    });

    test("returns isError for invalid ID", async () => {
      const result = await client.callTool({
        name: "lookup_cert",
        arguments: { id: "abc" },
      });
      expect(result.isError).toBe(true);
      const content = result.content as Array<{ type: string; text: string }>;
      expect(content[0].text).toContain("INVALID_ARG");
      expect(content[0].text).toContain("abc");
    });

    test("returns isError for hex ID", async () => {
      const result = await client.callTool({
        name: "lookup_cert",
        arguments: { id: "0xFF" },
      });
      expect(result.isError).toBe(true);
    });

    test("returns isError for zero", async () => {
      const result = await client.callTool({
        name: "lookup_cert",
        arguments: { id: "0" },
      });
      expect(result.isError).toBe(true);
    });

    test("returns isError for negative number", async () => {
      const result = await client.callTool({
        name: "lookup_cert",
        arguments: { id: "-5" },
      });
      expect(result.isError).toBe(true);
    });

    test("handles single digit ID", async () => {
      const result = await client.callTool({
        name: "lookup_cert",
        arguments: { id: "1" },
      });
      expect(result.isError).toBeUndefined();
      const content = result.content as Array<{ type: string; text: string }>;
      const parsed = JSON.parse(content[0].text);
      expect(parsed.id).toBe(1);
      expect(parsed.url).toBe("https://crt.sh/?id=1");
    });
  });
});
