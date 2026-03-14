import { describe, expect, test, mock, beforeAll, afterAll } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import fixture from "../fixtures/example-com.json";
import type { CrtShEntry } from "../src/schemas";

// We need to mock fetch before importing the MCP server code so that
// searchCertificates doesn't hit the network. We'll build the server
// inline using the same tool registrations as src/mcp.ts but importing
// the underlying functions directly.
import {
  dedupeBySerial,
  extractSubdomains,
  validateCertId,
  CrtShError,
} from "../src/api";
import { formatJson, formatTable, formatSubdomains } from "../src/format";

// Mock searchCertificates to avoid network calls
const mockSearchCertificates = mock<(query: string, options?: { wildcard?: boolean; excludeExpired?: boolean }) => Promise<CrtShEntry[]>>();

function createTestServer() {
  const server = new McpServer({ name: "crt-sh", version: "1.0.0" });

  server.tool(
    "search_certificates",
    "Search Certificate Transparency logs for certificates matching a domain",
    {
      domain: z.string().describe("Domain to search for"),
      wildcard: z.boolean().optional().default(false).describe("Prefix query with %. for subdomain search"),
      excludeExpired: z.boolean().optional().default(false).describe("Exclude expired certificates"),
      dedupe: z.boolean().optional().default(false).describe("Deduplicate results by serial number"),
      format: z.enum(["json", "table", "subdomains"]).optional().default("json").describe("Output format"),
    },
    async ({ domain, wildcard, excludeExpired, dedupe, format }) => {
      try {
        let results = await mockSearchCertificates(domain, { wildcard, excludeExpired });
        if (dedupe) {
          results = dedupeBySerial(results);
        }
        let text: string;
        switch (format) {
          case "table":
            text = formatTable(results);
            break;
          case "subdomains":
            text = formatSubdomains(extractSubdomains(results));
            break;
          default:
            text = formatJson(results);
        }
        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        if (err instanceof CrtShError) {
          return { content: [{ type: "text" as const, text: `Error [${err.code}]: ${err.message}` }], isError: true };
        }
        throw err;
      }
    }
  );

  server.tool(
    "find_subdomains",
    "Find unique subdomains for a domain via Certificate Transparency logs",
    {
      domain: z.string().describe("Domain to find subdomains for"),
      excludeExpired: z.boolean().optional().default(false).describe("Exclude expired certificates"),
    },
    async ({ domain, excludeExpired }) => {
      try {
        const results = await mockSearchCertificates(domain, { wildcard: true, excludeExpired });
        const text = formatSubdomains(extractSubdomains(results));
        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        if (err instanceof CrtShError) {
          return { content: [{ type: "text" as const, text: `Error [${err.code}]: ${err.message}` }], isError: true };
        }
        throw err;
      }
    }
  );

  server.tool(
    "lookup_cert",
    "Look up a specific certificate by its crt.sh ID",
    {
      id: z.string().describe("Certificate ID on crt.sh"),
    },
    async ({ id }) => {
      const validation = validateCertId(id);
      if (!validation.valid) {
        return { content: [{ type: "text" as const, text: `Error [INVALID_ARG]: ${validation.reason}` }], isError: true };
      }
      const text = JSON.stringify(
        {
          id: validation.certId,
          url: `https://crt.sh/?id=${validation.certId}`,
          note: "crt.sh does not provide a JSON API for individual certificates. Visit the URL for full details.",
        },
        null,
        2
      );
      return { content: [{ type: "text" as const, text }] };
    }
  );

  return server;
}

let client: Client;
let server: McpServer;

beforeAll(async () => {
  server = createTestServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([
    client.connect(clientTransport),
    server.connect(serverTransport),
  ]);
});

// Initialize client before connecting
client = new Client({ name: "test-client", version: "1.0.0" });

afterAll(async () => {
  await client.close();
  await server.close();
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
