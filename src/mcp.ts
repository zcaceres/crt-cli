#!/usr/bin/env bun

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  searchCertificates,
  dedupeBySerial,
  extractSubdomains,
  validateCertId,
  CrtShError,
} from "./api";
import { formatJson, formatTable, formatSubdomains } from "./format";
import pkg from "../package.json";

export function createServer() {
  const server = new McpServer({
    name: "crt-sh",
    version: pkg.version,
  });

  server.tool(
    "search_certificates",
    "Search Certificate Transparency logs for certificates matching a domain",
    {
      domain: z.string().min(1).describe("Domain to search for"),
      wildcard: z.boolean().optional().default(false).describe("Prefix query with %. for subdomain search"),
      excludeExpired: z.boolean().optional().default(false).describe("Exclude expired certificates"),
      dedupe: z.boolean().optional().default(false).describe("Deduplicate results by serial number"),
      format: z.enum(["json", "table", "subdomains"]).optional().default("json").describe("Output format"),
    },
    async ({ domain, wildcard, excludeExpired, dedupe, format }) => {
      try {
        let results = await searchCertificates(domain, { wildcard, excludeExpired });
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
      domain: z.string().min(1).describe("Domain to find subdomains for"),
      excludeExpired: z.boolean().optional().default(false).describe("Exclude expired certificates"),
    },
    async ({ domain, excludeExpired }) => {
      try {
        const results = await searchCertificates(domain, { wildcard: true, excludeExpired });
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

if (import.meta.main) {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
