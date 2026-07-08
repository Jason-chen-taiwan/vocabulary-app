export interface Env {
  DATABASE_URL: string
  AUTH_SECRET: string
  AUTH_GOOGLE_ID: string
  AUTH_GOOGLE_SECRET: string
}

const REQUIRED: (keyof Env)[] = [
  'DATABASE_URL',
  'AUTH_SECRET',
  'AUTH_GOOGLE_ID',
  'AUTH_GOOGLE_SECRET',
]

export function readEnv(source: Record<string, string | undefined>): Env {
  const missing = REQUIRED.filter((k) => !source[k])
  if (missing.length > 0) {
    throw new Error(`Missing env vars: ${missing.join(', ')}`)
  }
  return {
    DATABASE_URL: source.DATABASE_URL!,
    AUTH_SECRET: source.AUTH_SECRET!,
    AUTH_GOOGLE_ID: source.AUTH_GOOGLE_ID!,
    AUTH_GOOGLE_SECRET: source.AUTH_GOOGLE_SECRET!,
  }
}

export function getEnv(): Env {
  // ponytail: during `next build` page-data collection, Worker secrets aren't
  // present yet (they live only in the deployed Worker runtime). Module-load side
  // effects (repository constructors calling getPrisma -> getEnv) would throw and
  // fail the build. Return placeholders in the build phase ONLY; runtime stays strict.
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    const source = process.env as Record<string, string | undefined>
    return {
      DATABASE_URL: source.DATABASE_URL ?? 'postgresql://build:build@localhost/build',
      AUTH_SECRET: source.AUTH_SECRET ?? 'build-time-placeholder',
      AUTH_GOOGLE_ID: source.AUTH_GOOGLE_ID ?? 'build',
      AUTH_GOOGLE_SECRET: source.AUTH_GOOGLE_SECRET ?? 'build',
    }
  }
  return readEnv(process.env as Record<string, string | undefined>)
}
