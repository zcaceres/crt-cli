import type { CrtShEntry } from "../../src/schemas";

/** 3 realistic entries for example.com with edge-case fields. */
export const exampleComEntries: CrtShEntry[] = [
  {
    issuer_ca_id: 16418,
    issuer_name: "C=US, O=Let's Encrypt Authority X3, Inc., CN=R3",
    common_name: "example.com",
    name_value: "example.com\nwww.example.com",
    id: 9876543210,
    entry_timestamp: null,
    not_before: "2025-06-01T00:00:00",
    not_after: "2025-09-01T00:00:00",
    serial_number: "04a1b2c3d4e5f60718293a4b5c6d7e8f",
    result_count: 3,
  },
  {
    issuer_ca_id: 183267,
    issuer_name: "C=US, O=Amazon, OU=Server CA 1B, CN=Amazon RSA 2048 M02",
    common_name: "mail.example.com",
    name_value: "mail.example.com",
    id: 9876543211,
    entry_timestamp: "2025-05-30T14:22:33.456",
    not_before: "2025-05-30T00:00:00",
    not_after: "2026-06-30T23:59:59",
    serial_number: "0f1e2d3c4b5a69788796a5b4c3d2e1f0",
    result_count: 1,
  },
  {
    issuer_ca_id: 12345,
    issuer_name: 'C=US, O=DigiCert "Test" CA, CN=DigiCert Global G2',
    common_name: "*.example.com",
    name_value: "*.example.com",
    id: 9876543212,
    entry_timestamp: "2025-04-15T08:00:00.000",
    not_before: "2025-04-15T00:00:00",
    not_after: "2026-04-15T23:59:59",
    serial_number: "aa11bb22cc33dd44ee55ff6600778899",
    result_count: 1,
  },
];

/** 2 realistic entries for example.org. */
export const exampleOrgEntries: CrtShEntry[] = [
  {
    issuer_ca_id: 16418,
    issuer_name: "C=US, O=Let's Encrypt, CN=R3",
    common_name: "example.org",
    name_value: "example.org",
    id: 1122334455,
    entry_timestamp: "2025-07-01T12:00:00.000",
    not_before: "2025-07-01T00:00:00",
    not_after: "2025-10-01T00:00:00",
    serial_number: "deadbeef01234567890abcdef0123456",
    result_count: 1,
  },
  {
    issuer_ca_id: 183267,
    issuer_name: "C=US, O=Amazon, CN=Amazon RSA 2048 M02",
    common_name: "www.example.org",
    name_value: "www.example.org\nstaging.example.org",
    id: 1122334456,
    entry_timestamp: "2025-07-10T09:30:00.000",
    not_before: "2025-07-10T00:00:00",
    not_after: "2026-07-10T23:59:59",
    serial_number: "cafebabe98765432100fedcba9876543",
    result_count: 2,
  },
];
