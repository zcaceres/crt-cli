# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.0] - 2026-03-15

### Added
- Domain input validation — rejects obviously invalid domains (missing dots, invalid characters, too long) with `INVALID_DOMAIN` error code
- MCP `search_certificates` tool now accepts optional `domains` array for multi-domain search
- CHANGELOG.md for structured release tracking
- Fixture-based integration tests for CSV and multi-domain pipelines

### Changed
- Unified format dispatch in CLI — eliminated duplicated switch blocks for single/multi-domain formatting
- Integration tests in CI now surface failures as warning annotations instead of silently passing

## [1.0.0] - 2025-03-15

### Added
- CLI with `search`, `subdomains`, and `cert` commands
- MCP server with `search_certificates`, `find_subdomains`, and `lookup_cert` tools
- TypeScript library exports via `crt-cli` package
- Output formats: JSON, table, CSV (RFC 4180), subdomains
- Multi-domain search with sequential requests and configurable delay
- Certificate deduplication by serial number
- Retry with exponential backoff on network errors and HTTP 502
- Certificate ID validation (rejects hex, octal, scientific notation)
- `--describe` flag for machine-readable command schema
- CI/CD with lint, test, integration tests, and automated binary releases
- Standalone binaries for Linux (x64/arm64), macOS (x64/arm64), Windows (x64)
