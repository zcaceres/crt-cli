#!/usr/bin/env bun

import { Command, CommanderError } from "commander";
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

function printHelp() {
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

async function main() {
  const rawArgs = process.argv.slice(2);

  // Short-circuit --describe before Commander parses
  if (rawArgs.includes("--describe")) {
    console.log(JSON.stringify(DESCRIBE_OUTPUT, null, 2));
    process.exit(0);
  }

  // No args → help + exit 0
  if (rawArgs.length === 0) {
    printHelp();
    process.exit(0);
  }

  // Check what kind of args we have
  const commands = ["search", "subdomains", "cert"];
  const hasHelp = rawArgs.includes("--help") || rawArgs.includes("-h");
  const firstNonFlag = rawArgs.find(a => !a.startsWith("-"));

  if (!firstNonFlag && !hasHelp) {
    // Flags-only (no command) → help + exit 1
    printHelp();
    process.exit(1);
  }

  if (firstNonFlag && !commands.includes(firstNonFlag) && !hasHelp) {
    // Unknown command
    console.error(
      formatError(
        `Unknown command: ${firstNonFlag}. Run 'crt --help' for usage.`,
        "UNKNOWN_COMMAND"
      )
    );
    process.exit(1);
  }

  const program = new Command()
    .name("crt")
    .description("crt-cli — Agent-friendly CLI for crt.sh Certificate Transparency log search")
    .exitOverride()
    .configureOutput({
      writeOut: (str) => process.stdout.write(str),
      writeErr: (str) => process.stdout.write(str),
    });

  program
    .command("search")
    .description("Search certificates for a domain in CT logs")
    .argument("<domain>", "Domain to search for")
    .option("-w, --wildcard", "Prefix query with %. for subdomain search", false)
    .option("-e, --exclude-expired", "Exclude expired certificates", false)
    .option("-f, --format <format>", "Output format: json (default), table, subdomains", "json")
    .option("-d, --dedupe", "Deduplicate results by serial number", false)
    .action(async (domain: string, opts: { wildcard: boolean; excludeExpired: boolean; format: string; dedupe: boolean }) => {
      const validFormats = ["json", "table", "subdomains"];
      if (opts.format.startsWith("-")) {
        console.error(formatError("--format requires a value (json, table, subdomains)", "MISSING_VALUE"));
        process.exit(1);
      }
      if (!validFormats.includes(opts.format)) {
        console.error(formatError(`Unknown format: ${opts.format}`, "UNKNOWN_FORMAT"));
        process.exit(1);
      }

      let results = await searchCertificates(domain, {
        wildcard: opts.wildcard,
        excludeExpired: opts.excludeExpired,
      });

      if (opts.dedupe) {
        results = dedupeBySerial(results);
      }

      switch (opts.format) {
        case "json":
          console.log(formatJson(results));
          break;
        case "table":
          console.log(formatTable(results));
          break;
        case "subdomains":
          console.log(formatSubdomains(extractSubdomains(results)));
          break;
      }
    });

  program
    .command("subdomains")
    .description("Find unique subdomains for a domain via CT logs")
    .argument("<domain>", "Domain to find subdomains for")
    .option("-e, --exclude-expired", "Exclude expired certificates", false)
    .action(async (domain: string, opts: { excludeExpired: boolean }) => {
      const results = await searchCertificates(domain, {
        wildcard: true,
        excludeExpired: opts.excludeExpired,
      });
      console.log(formatSubdomains(extractSubdomains(results)));
    });

  program
    .command("cert")
    .description("Look up a specific certificate by its crt.sh ID")
    .argument("<id>", "Certificate ID on crt.sh")
    .action(async (id: string) => {
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
    });

  // Default action when no command is given (just flags like -w -e -d)
  program.action(() => {
    program.outputHelp();
    process.exit(1);
  });

  try {
    await program.parseAsync(rawArgs, { from: "user" });
  } catch (err) {
    if (err instanceof CommanderError) {
      switch (err.code) {
        case "commander.unknownOption":
          console.error(formatError(err.message, "UNKNOWN_FLAG"));
          process.exit(1);
          break;
        case "commander.missingArgument":
          console.error(formatError(err.message, "MISSING_ARG"));
          process.exit(1);
          break;
        case "commander.optionMissingArgument":
          console.error(formatError(err.message, "MISSING_VALUE"));
          process.exit(1);
          break;
        case "commander.unknownCommand":
          console.error(formatError(err.message, "UNKNOWN_COMMAND"));
          process.exit(1);
          break;
        case "commander.helpDisplayed":
          process.exit(0);
          break;
        default:
          console.error(formatError(err.message, "CLI_ERROR"));
          process.exit(1);
      }
    } else if (err instanceof CrtShError) {
      console.error(formatError(err.message, err.code));
      process.exit(1);
    } else {
      console.error(
        formatError(
          err instanceof Error ? err.message : String(err),
          "UNKNOWN_ERROR"
        )
      );
      process.exit(1);
    }
  }
}

if (import.meta.main) {
  main();
}
