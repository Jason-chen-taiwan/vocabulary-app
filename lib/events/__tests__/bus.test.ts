import { describe, it, expect, vi } from 'vitest'
import { EventBus } from '@/lib/events/bus'

const at = new Date('2026-06-27T00:00:00Z')

describe('EventBus', () => {
  it('delivers an event to subscribers of that type only', async () => {
    const bus = new EventBus()
    const onReview = vi.fn()
    const onSession = vi.fn()
    bus.subscribe('ReviewCompleted', onReview)
    bus.subscribe('SessionFinished', onSession)
    await bus.publish({ type: 'ReviewCompleted', userId: 'u1', wordId: 'w1', rating: 'good', at })
    expect(onReview).toHaveBeenCalledOnce()
    expect(onReview).toHaveBeenCalledWith({ type: 'ReviewCompleted', userId: 'u1', wordId: 'w1', rating: 'good', at })
    expect(onSession).not.toHaveBeenCalled()
  })

  it('awaits async handlers', async () => {
    const bus = new EventBus()
    const order: string[] = []
    bus.subscribe('SessionFinished', async () => { await Promise.resolve(); order.push('handler') })
    await bus.publish({ type: 'SessionFinished', userId: 'u1', reviewed: 5, at })
    order.push('after')
    expect(order).toEqual(['handler', 'after'])
  })

  it('publish with no subscribers resolves quietly', async () => {
    const bus = new EventBus()
    await expect(bus.publish({ type: 'SessionFinished', userId: 'u1', reviewed: 0, at })).resolves.toBeUndefined()
  })
})
