#!/usr/bin/env bun

import {
  searchCertificates,
  dedupeBySerial,
  extractSubdomains,
  CrtShError,
  validateCertId,
} from "./api";
import { formatJson, formatTable, formatSubdomains, formatError } from "./format";

const DESCRIBE_OUTPUT = {
  name: "crt-cli",
  description:
    "Agent-friendly CLI for crt.sh Certificate Transparency log search",
  commands: [
    {
      name: "search",
      description: "Search certificates for a domain in CT logs",
      usage: "crt search <domain>",
      args: [
        {
          name: "domain",
          type: "string",
          required: true,
          description: "Domain to search for",
        },
      ],
      flags: [
        {
          name: "--wildcard",
          alias: "-w",
          type: "boolean",
          default: false,
          description: "Prefix query with %. for subdomain search",
        },
        {
          name: "--exclude-expired",
          alias: "-e",
          type: "boolean",
          default: false,
          description: "Exclude expired certificates",
        },
        {
          name: "--format",
          alias: "-f",
          type: "string",
          default: "json",
          description: "Output format: json, table, or subdomains",
        },
        {
          name: "--dedupe",
          alias: "-d",
          type: "boolean",
          default: false,
          description: "Deduplicate results by serial number",
        },
      ],
      examples: [
        "crt search example.com",
        "crt search example.com -w -e -d",
        "crt search example.com --format table",
      ],
    },
    {
      name: "subdomains",
      description:
        "Search for subdomains of a domain (shortcut for search -w with subdomain output)",
      usage: "crt subdomains <domain>",
      args: [
        {
          name: "domain",
          type: "string",
          required: true,
          description: "Domain to find subdomains for",
        },
      ],
      flags: [
        {
          name: "--exclude-expired",
          alias: "-e",
          type: "boolean",
          default: false,
          description: "Exclude expired certificates",
        },
      ],
      examples: ["crt subdomains example.com", "crt subdomains example.com -e"],
    },
    {
      name: "cert",
      description: "Look up a specific certificate by crt.sh ID",
      usage: "crt cert <id>",
      args: [
        {
          name: "id",
          type: "number",
          required: true,
          description: "Certificate ID on crt.sh",
        },
      ],
      flags: [],
      examples: ["crt cert 12345678"],
    },
  ],
  api: {
    base_url: "https://crt.sh/",
    rate_limit: "5 requests/minute",
    max_results: 999,
  },
};

export function parseArgs(args: string[]) {
  const flags: Record<string, boolean | string> = {};
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--wildcard" || arg === "-w") {
      flags.wildcard = true;
    } else if (arg === "--exclude-expired" || arg === "-e") {
      flags.excludeExpired = true;
    } else if (arg === "--dedupe" || arg === "-d") {
      flags.dedupe = true;
    } else if (arg === "--format" || arg === "-f") {
      const next = args[i + 1];
      if (!next || next.startsWith("-")) {
        console.error(formatError("--format requires a value (json, table, subdomains)", "MISSING_VALUE"));
        process.exit(1);
      }
      flags.format = args[++i];
    } else if (arg === "--help" || arg === "-h") {
      flags.help = true;
    } else if (arg === "--describe") {
      flags.describe = true;
    } else if (arg === "--") {
      positional.push(...args.slice(i + 1));
      break;
    } else if (arg.startsWith("-") && Number.isNaN(Number(arg))) {
      console.error(formatError(`Unknown flag: ${arg}`, "UNKNOWN_FLAG"));
      process.exit(1);
    } else {
      positional.push(arg);
    }
  }

  return { flags, positional };
}

function printHelp(command?: string) {
  if (command === "search") {
    console.log(`Usage: crt search <domain> [flags]

Search certificates for a domain in CT logs.

Flags:
  -w, --wildcard         Prefix query with %. for subdomain search
  -e, --exclude-expired  Exclude expired certificates
  -f, --format <format>  Output format: json (default), table, subdomains
  -d, --dedupe           Deduplicate results by serial number

Examples:
  crt search example.com
  crt search example.com -w -e -d
  crt search example.com --format table`);
  } else if (command === "subdomains") {
    console.log(`Usage: crt subdomains <domain> [flags]

Find unique subdomains for a domain via CT logs.
Shortcut for: crt search <domain> -w --format subdomains

Flags:
  -e, --exclude-expired  Exclude expired certificates

Examples:
  crt subdomains example.com
  crt subdomains example.com -e`);
  } else if (command === "cert") {
    console.log(`Usage: crt cert <id>

Look up a specific certificate by its crt.sh ID.
Returns the crt.sh URL and available metadata.

Examples:
  crt cert 12345678`);
  } else {
    console.log(`crt-cli — Agent-friendly CLI for crt.sh Certificate Transparency log search

Usage: crt <command> [args] [flags]

Commands:
  search <domain>      Search certificates for a domain
  subdomains <domain>  Find unique subdomains via CT logs
  cert <id>            Look up a certificate by ID

Global Flags:
  --help, -h           Show help
  --describe           Machine-readable JSON description of all commands

Examples:
  crt search example.com
  crt search example.com -w -e -d --format table
  crt subdomains example.com
  crt cert 12345678
  crt --describe`);
  }
}

async function main() {
  const rawArgs = process.argv.slice(2);

  if (rawArgs.length === 0) {
    printHelp();
    process.exit(0);
  }

  const { flags, positional } = parseArgs(rawArgs);

  if (flags.describe) {
    console.log(JSON.stringify(DESCRIBE_OUTPUT, null, 2));
    process.exit(0);
  }

  if (flags.help && positional.length === 0) {
    printHelp();
    process.exit(0);
  }

  const command = positional[0];

  if (!command) {
    printHelp();
    process.exit(1);
  }

  if (flags.help) {
    printHelp(command);
    process.exit(0);
  }

  try {
    switch (command) {
      case "search": {
        const domain = positional[1];
        if (!domain) {
          console.error(
            formatError("Missing required argument: <domain>", "MISSING_ARG")
          );
          process.exit(1);
        }

        let results = await searchCertificates(domain, {
          wildcard: flags.wildcard === true,
          excludeExpired: flags.excludeExpired === true,
        });

        if (flags.dedupe) {
          results = dedupeBySerial(results);
        }

        const format = (flags.format as string) ?? "json";
        switch (format) {
          case "json":
            console.log(formatJson(results));
            break;
          case "table":
            console.log(formatTable(results));
            break;
          case "subdomains":
            console.log(formatSubdomains(extractSubdomains(results)));
            break;
          default:
            console.error(
              formatError(`Unknown format: ${format}`, "UNKNOWN_FORMAT")
            );
            process.exit(1);
        }
        break;
      }

      case "subdomains": {
        const domain = positional[1];
        if (!domain) {
          console.error(
            formatError("Missing required argument: <domain>", "MISSING_ARG")
          );
          process.exit(1);
        }

        const results = await searchCertificates(domain, {
          wildcard: true,
          excludeExpired: flags.excludeExpired === true,
        });

        console.log(formatSubdomains(extractSubdomains(results)));
        break;
      }

      case "cert": {
        const id = positional[1];
        if (!id) {
          console.error(
            formatError("Missing required argument: <id>", "MISSING_ARG")
          );
          process.exit(1);
        }

        const validation = validateCertId(id);
        if (!validation.valid) {
          console.error(formatError(validation.reason, "INVALID_ARG"));
          process.exit(1);
        }
        const certId = validation.certId;

        console.log(
          JSON.stringify(
            {
              id: certId,
              url: `https://crt.sh/?id=${certId}`,
              note: "crt.sh does not provide a JSON API for individual certificates. Visit the URL for full details.",
            },
            null,
            2
          )
        );
        break;
      }

      default:
        console.error(
          formatError(
            `Unknown command: ${command}. Run 'crt --help' for usage.`,
            "UNKNOWN_COMMAND"
          )
        );
        process.exit(1);
    }
  } catch (err) {
    if (err instanceof CrtShError) {
      console.error(formatError(err.message, err.code));
    } else {
      console.error(
        formatError(
          err instanceof Error ? err.message : String(err),
          "UNKNOWN_ERROR"
        )
      );
    }
    process.exit(1);
  }
}

if (import.meta.main) {
  main();
}
