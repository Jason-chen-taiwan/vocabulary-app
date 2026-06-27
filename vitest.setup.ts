// Test-only scaffolding: set safe dummy defaults for env vars so that
// modules which call getEnv() at import time (like auth.ts) don't throw
// "Missing env vars" during unit tests.
// These values are never used for real connections – they are placeholders only.
// Do NOT put real secrets here; this file is committed.

const DEFAULTS: Record<string, string> = {
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  AUTH_SECRET: 'test-placeholder-secret',
  AUTH_GOOGLE_ID: 'test-placeholder-google-id',
  AUTH_GOOGLE_SECRET: 'test-placeholder-google-secret',
}

for (const [key, value] of Object.entries(DEFAULTS)) {
  if (!process.env[key]) {
    process.env[key] = value
  }
}
