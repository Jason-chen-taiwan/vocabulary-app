import { describe, it, expect } from 'vitest'
import { shouldCache } from '@/public/sw-strategy'

describe('shouldCache', () => {
  it('caches static assets', () => {
    expect(shouldCache('/icons/icon-192.png')).toBe(true)
    expect(shouldCache('/_next/static/chunk.js')).toBe(true)
  })
  it('never caches auth or api routes', () => {
    expect(shouldCache('/api/auth/session')).toBe(false)
    expect(shouldCache('/api/anything')).toBe(false)
  })
})
