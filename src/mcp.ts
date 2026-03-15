#!/usr/bin/env bun

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import pkg from "../package.json";
import {
  CrtShError,
  dedupeBySerial,
  extractSubdomains,
  searchCertificates,
  searchMultipleDomains,
  validateCertId,
  validateDomain,
} from "./api";
import {
  formatCsv,
  formatJson,
  formatMultiDomainJson,
  formatMultiDomainResults,
  formatSubdomains,
  formatTable,
} from "./format";

/** Create an MCP server with tools for searching CT logs, finding subdomains, and looking up certificates. */
export function createServer() {
  const server = new McpServer({
    name: "crt-sh",
    version: pkg.version,
  });

  server.tool(
    "search_certificates",
    "Search Certificate Transparency logs for certificates matching one or more domains. Use 'domain' for single-domain search or 'domains' for multi-domain grouped results.",
    {
      domain: z
        .string()
        .min(1)
        .describe("Domain to search for (single-domain mode)")
        .optional(),
      domains: z
        .array(z.string().min(1))
        .min(1)
        .describe(
          "Multiple domains to search (multi-domain mode, returns grouped results)",
        )
        .optional(),
      wildcard: z
        .boolean()
        .optional()
        .default(false)
        .describe("Prefix query with %. for subdomain search"),
      excludeExpired: z
        .boolean()
        .optional()
        .default(false)
        .describe("Exclude expired certificates"),
      dedupe: z
        .boolean()
        .optional()
        .default(false)
        .describe("Deduplicate results by serial number"),
      format: z
        .enum(["json", "table", "csv", "subdomains"])
        .optional()
        .default("json")
        .describe("Output format"),
    },
    async ({ domain, domains, wildcard, excludeExpired, dedupe, format }) => {
      if (!domain && !domains) {
        return {
          content: [
            {
              type: "text" as const,
              text: 'Error [MISSING_ARG]: Either "domain" or "domains" is required',
            },
          ],
          isError: true,
        };
      }

      const domainsToValidate = domains ?? [domain!];
      for (const d of domainsToValidate) {
        const check = validateDomain(d);
        if (!check.valid) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Error [INVALID_DOMAIN]: ${check.reason}`,
              },
            ],
            isError: true,
          };
        }
      }

      const getFormatter = () => {
        switch (format) {
          case "table":
            return formatTable;
          case "csv":
            return formatCsv;
          case "subdomains":
            return (entries: import("./schemas").CrtShEntry[]) =>
              formatSubdomains(extractSubdomains(entries));
          default:
            return formatJson;
        }
      };

      try {
        // Multi-domain mode
        if (domains) {
          const { results, errors } = await searchMultipleDomains(domains, {
            wildcard,
            excludeExpired,
          });

          if (dedupe) {
            for (const [d, entries] of results) {
              results.set(d, dedupeBySerial(entries));
            }
          }

          let text: string;
          if (format === "json") {
            text = formatMultiDomainJson(results, errors);
          } else {
            text = formatMultiDomainResults(results, errors, getFormatter());
          }
          return { content: [{ type: "text" as const, text }] };
        }

        // Single-domain mode
        let results = await searchCertificates(domain!, {
          wildcard,
          excludeExpired,
        });
        if (dedupe) {
          results = dedupeBySerial(results);
        }
        const text = getFormatter()(results);
        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        if (err instanceof CrtShError) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Error [${err.code}]: ${err.message}`,
              },
            ],
            isError: true,
          };
        }
        throw err;
      }
    },
  );

  server.tool(
    "find_subdomains",
    "Find unique subdomains for a domain via Certificate Transparency logs",
    {
      domain: z.string().min(1).describe("Domain to find subdomains for"),
      excludeExpired: z
        .boolean()
        .optional()
        .default(false)
        .describe("Exclude expired certificates"),
    },
    async ({ domain, excludeExpired }) => {
      try {
        const results = await searchCertificates(domain, {
          wildcard: true,
          excludeExpired,
        });
        const text = formatSubdomains(extractSubdomains(results));
        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        if (err instanceof CrtShError) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Error [${err.code}]: ${err.message}`,
              },
            ],
            isError: true,
          };
        }
        throw err;
      }
    },
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
        return {
          content: [
            {
              type: "text" as const,
              text: `Error [INVALID_ARG]: ${validation.reason}`,
            },
          ],
          isError: true,
        };
      }
      const text = JSON.stringify(
        {
          id: validation.certId,
          url: `https://crt.sh/?id=${validation.certId}`,
          note: "crt.sh does not provide a JSON API for individual certificates. Visit the URL for full details.",
        },
        null,
        2,
      );
      return { content: [{ type: "text" as const, text }] };
    },
  );

  return server;
}

if (import.meta.main) {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
