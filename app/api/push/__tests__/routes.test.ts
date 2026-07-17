import { describe, it, expect, vi } from 'vitest'
import { handleSubscribe, handleUnsubscribe } from '../subscribe/handler'

const okUser = { id: 'u1', email: 'a@b.c', name: null, image: null }

function repo() {
  return { upsert: vi.fn(async () => {}), deleteByEndpoint: vi.fn(async () => {}) }
}

describe('handleSubscribe', () => {
  it('rejects when not authenticated', async () => {
    const r = repo()
    const res = await handleSubscribe(null, { endpoint: 'e', keys: { p256dh: 'k', auth: 'a' } }, r as never)
    expect(res.ok).toBe(false)
    expect(r.upsert).not.toHaveBeenCalled()
  })

  it('upserts subscription bound to session user, ignoring any client userId', async () => {
    const r = repo()
    const res = await handleSubscribe(
      okUser,
      { endpoint: 'e', keys: { p256dh: 'k', auth: 'a' }, userId: 'ATTACKER' } as never,
      r as never
    )
    expect(res.ok).toBe(true)
    expect(r.upsert).toHaveBeenCalledWith('u1', { endpoint: 'e', p256dh: 'k', auth: 'a' })
  })

  it('rejects malformed body', async () => {
    const r = repo()
    const res = await handleSubscribe(okUser, { endpoint: 'e' } as never, r as never)
    expect(res.ok).toBe(false)
  })
})

describe('handleUnsubscribe', () => {
  it('deletes by endpoint when authed', async () => {
    const r = repo()
    const res = await handleUnsubscribe(okUser, { endpoint: 'e' }, r as never)
    expect(res.ok).toBe(true)
    expect(r.deleteByEndpoint).toHaveBeenCalledWith('e')
  })
  it('rejects when not authed', async () => {
    const r = repo()
    const res = await handleUnsubscribe(null, { endpoint: 'e' }, r as never)
    expect(res.ok).toBe(false)
    expect(r.deleteByEndpoint).not.toHaveBeenCalled()
  })
})
