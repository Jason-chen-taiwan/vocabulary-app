import { describe, it, expect, vi } from 'vitest'
import { PushSubscriptionRepository } from '../subscription-repo'

function fakeDb(overrides: Record<string, unknown> = {}) {
  return {
    pushSubscription: {
      upsert: vi.fn(async () => ({})),
      delete: vi.fn(async () => ({})),
    },
    ...overrides,
  } as never
}

describe('PushSubscriptionRepository', () => {
  it('upsert keys on endpoint and stores keys + userId', async () => {
    const db = fakeDb()
    const repo = new PushSubscriptionRepository(db)
    await repo.upsert('u1', { endpoint: 'https://push/x', p256dh: 'k', auth: 'a' })
    expect((db as never as { pushSubscription: { upsert: ReturnType<typeof vi.fn> } })
      .pushSubscription.upsert).toHaveBeenCalledWith({
      where: { endpoint: 'https://push/x' },
      create: { userId: 'u1', endpoint: 'https://push/x', p256dh: 'k', auth: 'a' },
      update: { userId: 'u1', p256dh: 'k', auth: 'a' },
    })
  })

  it('deleteByEndpoint removes the row', async () => {
    const db = fakeDb()
    const repo = new PushSubscriptionRepository(db)
    await repo.deleteByEndpoint('https://push/x')
    expect((db as never as { pushSubscription: { delete: ReturnType<typeof vi.fn> } })
      .pushSubscription.delete).toHaveBeenCalledWith({ where: { endpoint: 'https://push/x' } })
  })
})
