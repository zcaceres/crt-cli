#!/usr/bin/env bun

import { Command, CommanderError } from "commander";
import pkg from "../package.json";
import {
  CrtShError,
  dedupeBySerial,
  extractSubdomains,
  searchCertificates,
  searchMultipleDomains,
  validateCertId,
} from "./api";
import {
  formatCsv,
  formatError,
  formatJson,
  formatMultiDomainJson,
  formatMultiDomainResults,
  formatSubdomains,
  formatTable,
} from "./format";

const DESCRIBE_OUTPUT = {
  name: "crt-cli",
  description:
    "Agent-friendly CLI for crt.sh Certificate Transparency log search",
  commands: [
    {
      name: "search",
      description: "Search certificates for one or more domains in CT logs",
      usage: "crt search <domains...>",
      args: [
        {
          name: "domains",
          type: "string[]",
          required: true,
          description: "One or more domains to search for",
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
          description: "Output format: json, table, csv, or subdomains",
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
        "crt search example.com example.org",
        "crt search example.com -w -e -d",
        "crt search example.com --format csv",
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

function buildProgram() {
  const program = new Command()
    .name("crt")
    .description(
      "Agent-friendly CLI for crt.sh Certificate Transparency log search",
    )
    .version(pkg.version, "-V, --version")
    .exitOverride()
    .configureOutput({
      writeOut: (str) => process.stdout.write(str),
      writeErr: (str) => process.stdout.write(str),
    });

  program
    .command("search")
    .description("Search certificates for one or more domains in CT logs")
    .argument("<domains...>", "One or more domains to search for")
    .option(
      "-w, --wildcard",
      "Prefix query with %. for subdomain search",
      false,
    )
    .option("-e, --exclude-expired", "Exclude expired certificates", false)
    .option(
      "-f, --format <format>",
      "Output format: json (default), table, csv, subdomains",
      "json",
    )
    .option("-d, --dedupe", "Deduplicate results by serial number", false)
    .action(
      async (
        domains: string[],
        opts: {
          wildcard: boolean;
          excludeExpired: boolean;
          format: string;
          dedupe: boolean;
        },
      ) => {
        const validFormats = ["json", "table", "csv", "subdomains"];
        if (opts.format.startsWith("-")) {
          console.error(
            formatError(
              "--format requires a value (json, table, csv, subdomains)",
              "MISSING_VALUE",
            ),
          );
          process.exit(1);
        }
        if (!validFormats.includes(opts.format)) {
          console.error(
            formatError(`Unknown format: ${opts.format}`, "UNKNOWN_FORMAT"),
          );
          process.exit(1);
        }

        if (domains.length === 1) {
          let results = await searchCertificates(domains[0], {
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
            case "csv":
              console.log(formatCsv(results));
              break;
            case "subdomains":
              console.log(formatSubdomains(extractSubdomains(results)));
              break;
          }
        } else {
          const { results, errors } = await searchMultipleDomains(domains, {
            wildcard: opts.wildcard,
            excludeExpired: opts.excludeExpired,
          });

          if (opts.dedupe) {
            for (const [domain, entries] of results) {
              results.set(domain, dedupeBySerial(entries));
            }
          }

          switch (opts.format) {
            case "json":
              console.log(formatMultiDomainJson(results, errors));
              break;
            case "table":
              console.log(
                formatMultiDomainResults(results, errors, formatTable),
              );
              break;
            case "csv":
              console.log(formatMultiDomainResults(results, errors, formatCsv));
              break;
            case "subdomains":
              console.log(
                formatMultiDomainResults(results, errors, (entries) =>
                  formatSubdomains(extractSubdomains(entries)),
                ),
              );
              break;
          }
        }
      },
    );

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
          2,
        ),
      );
    });

  return program;
}

async function main() {
  const rawArgs = process.argv.slice(2);

  // Short-circuit --describe before Commander parses
  if (rawArgs.includes("--describe")) {
    console.log(JSON.stringify(DESCRIBE_OUTPUT, null, 2));
    process.exit(0);
  }

  const program = buildProgram();

  // No args → help + exit 0
  if (rawArgs.length === 0) {
    program.outputHelp();
    process.exit(0);
  }

  // Check what kind of args we have
  const commands = ["search", "subdomains", "cert"];
  const hasHelp = rawArgs.includes("--help") || rawArgs.includes("-h");
  const hasVersion = rawArgs.includes("--version") || rawArgs.includes("-V");
  const firstNonFlag = rawArgs.find((a) => !a.startsWith("-"));

  if (!firstNonFlag && !hasHelp && !hasVersion) {
    // Flags-only (no command) → help + exit 1
    program.outputHelp();
    process.exit(1);
  }

  if (firstNonFlag && !commands.includes(firstNonFlag) && !hasHelp) {
    // Unknown command
    console.error(
      formatError(
        `Unknown command: ${firstNonFlag}. Run 'crt --help' for usage.`,
        "UNKNOWN_COMMAND",
      ),
    );
    process.exit(1);
  }

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
        case "commander.version":
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
          "UNKNOWN_ERROR",
        ),
      );
      process.exit(1);
    }
  }
}

if (import.meta.main) {
  main();
}
