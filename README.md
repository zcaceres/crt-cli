# crt-cli

Search [Certificate Transparency](https://certificate.transparency.dev/) logs via [crt.sh](https://crt.sh). Available as a CLI, an MCP server, or a TypeScript library.

Built with [Bun](https://bun.sh).

## Install

```bash
bun install
```

## CLI

```bash
crt <command> [args] [flags]
```

### Commands

**search** — Search CT logs for certificates matching a domain.

```bash
crt search example.com
crt search example.com -w -e -d
crt search example.com --format table
```

| Flag | Alias | Description |
|------|-------|-------------|
| `--wildcard` | `-w` | Prefix query with `%.` for subdomain search |
| `--exclude-expired` | `-e` | Exclude expired certificates |
| `--dedupe` | `-d` | Deduplicate results by serial number |
| `--format <fmt>` | `-f` | Output format: `json` (default), `table`, `subdomains` |

**subdomains** — Find unique subdomains for a domain. Shortcut for `search -w --format subdomains`.

```bash
crt subdomains example.com
crt subdomains example.com -e
```

**cert** — Look up a specific certificate by its crt.sh ID.

```bash
crt cert 12345678
```

### Global flags

| Flag | Alias | Description |
|------|-------|-------------|
| `--version` | `-V` | Print version |
| `--describe` | | Output JSON schema of all commands (see below) |
| `--help` | `-h` | Show help |

### Machine-readable description

```bash
crt --describe
```

Outputs a JSON schema of all commands, arguments, and flags. Useful for agent tool discovery.

## MCP Server

The MCP server exposes the same functionality over the [Model Context Protocol](https://modelcontextprotocol.io/) via stdio transport.

```bash
bun run src/mcp.ts
```

### Tools

| Tool | Description |
|------|-------------|
| `search_certificates` | Search CT logs. Accepts `domain`, `wildcard`, `excludeExpired`, `dedupe`, `format`. |
| `find_subdomains` | Find unique subdomains for a domain (wildcard search). |
| `lookup_cert` | Look up a certificate by crt.sh ID. |

### Configuration

Add to your MCP client config:

```json
{
  "mcpServers": {
    "crt-sh": {
      "command": "bun",
      "args": ["run", "/path/to/crt-cli/src/mcp.ts"]
    }
  }
}
```

## Library

Import directly into your TypeScript/Bun project:

```ts
import {
  searchCertificates,
  extractSubdomains,
  dedupeBySerial,
  createServer,
} from "crt-cli";
```

### API

```ts
// Search for certificates
const certs = await searchCertificates("example.com", {
  wildcard: true,
  excludeExpired: true,
});

// Extract unique subdomains
const subs = extractSubdomains(certs);

// Deduplicate by serial number
const unique = dedupeBySerial(certs);

// Embed the MCP server in your own application
const server = createServer();
```

### Exports

| Export | Type | Description |
|--------|------|-------------|
| `searchCertificates` | function | Query crt.sh and return parsed results |
| `dedupeBySerial` | function | Deduplicate entries by serial number |
| `extractSubdomains` | function | Extract sorted unique subdomains from entries |
| `buildUrl` | function | Build a crt.sh query URL |
| `validateCertId` | function | Validate a certificate ID string |
| `CrtShError` | class | Error class with code (`NETWORK_ERROR`, `SERVER_ERROR`, `HTTP_ERROR`, `PARSE_ERROR`, `VALIDATION_ERROR`, `INVALID_ARG`) |
| `formatJson` | function | Format entries as pretty-printed JSON |
| `formatTable` | function | Format entries as an ASCII table |
| `formatSubdomains` | function | Format subdomains as a newline-separated list |
| `formatError` | function | Format an error as JSON |
| `createServer` | function | Create an MCP server instance |
| `CrtShEntrySchema` | Zod schema | Schema for a single crt.sh entry |
| `CrtShResponseSchema` | Zod schema | Schema for an array of entries |
| `CrtShEntry` | type | TypeScript type for a certificate entry |
| `CrtShResponse` | type | TypeScript type for the response array |

## Testing

```bash
bun test
```

108 tests across 9 files covering the CLI, API, formatters, argument parsing, schema validation, library exports, and MCP server.

## Linting

```bash
bun run check        # lint and format check
bun run check:fix    # auto-fix
```

Uses [Biome](https://biomejs.dev/) for linting and formatting.

## CI/CD

GitHub Actions runs lint and tests on every push and PR to `main`. On push to `main`, if the version in `package.json` has changed, it builds standalone binaries for Linux (x64, arm64), macOS (x64, arm64), and Windows (x64) and creates a GitHub release.
