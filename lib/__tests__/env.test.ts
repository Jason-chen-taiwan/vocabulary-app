import { describe, it, expect } from 'vitest'
import { readEnv } from '@/lib/env'

describe('readEnv', () => {
  it('returns parsed env when all present', () => {
    const env = readEnv({
      DATABASE_URL: 'postgres://x',
      AUTH_SECRET: 's',
      AUTH_GOOGLE_ID: 'id',
      AUTH_GOOGLE_SECRET: 'secret',
    })
    expect(env.DATABASE_URL).toBe('postgres://x')
  })

  it('throws listing all missing keys', () => {
    expect(() => readEnv({})).toThrowError(/DATABASE_URL/)
  })
})
