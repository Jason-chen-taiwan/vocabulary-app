import { describe, it, expect } from 'vitest'
import { toSessionUser } from '@/lib/auth/session'

describe('toSessionUser', () => {
  it('maps a session to a SessionUser', () => {
    const user = toSessionUser({
      user: { id: '1', email: 'a@b.c', name: 'Amy', image: null },
      expires: 'x',
    } as any)
    expect(user).toEqual({ id: '1', email: 'a@b.c', name: 'Amy', image: null })
  })

  it('returns null when no session', () => {
    expect(toSessionUser(null)).toBeNull()
  })
})
