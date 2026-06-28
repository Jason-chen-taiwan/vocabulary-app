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
    await bus.publish({ type: 'ReviewCompleted', userId: 'u1', wordId: 'w1', rating: 'good', correct: true, mastered: false, at })
    expect(onReview).toHaveBeenCalledOnce()
    expect(onReview).toHaveBeenCalledWith({ type: 'ReviewCompleted', userId: 'u1', wordId: 'w1', rating: 'good', correct: true, mastered: false, at })
    expect(onSession).not.toHaveBeenCalled()
  })

  it('awaits async handlers', async () => {
    const bus = new EventBus()
    const order: string[] = []
    bus.subscribe('SessionFinished', async () => { await Promise.resolve(); order.push('handler') })
    await bus.publish({ type: 'SessionFinished', userId: 'u1', reviewed: 5, correct: 5, at })
    order.push('after')
    expect(order).toEqual(['handler', 'after'])
  })

  it('publish with no subscribers resolves quietly', async () => {
    const bus = new EventBus()
    await expect(bus.publish({ type: 'SessionFinished', userId: 'u1', reviewed: 0, correct: 0, at })).resolves.toBeUndefined()
  })

  it('a throwing handler does not prevent subsequent handlers from running and publish resolves', async () => {
    const bus = new EventBus()
    const second = vi.fn()
    bus.subscribe('ReviewCompleted', async () => { throw new Error('handler boom') })
    bus.subscribe('ReviewCompleted', second)
    await expect(
      bus.publish({ type: 'ReviewCompleted', userId: 'u1', wordId: 'w1', rating: 'good', correct: true, mastered: false, at })
    ).resolves.toBeUndefined()
    expect(second).toHaveBeenCalledOnce()
  })
})
