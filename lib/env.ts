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
  return readEnv(process.env as Record<string, string | undefined>)
}
