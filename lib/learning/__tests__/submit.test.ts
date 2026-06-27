import { describe, it, expect, vi } from 'vitest'
import { submitReview, finishSession } from '@/lib/learning/submit'

const now = new Date('2026-06-27T00:00:00Z')
const newState = { due: now, stability: 0, difficulty: 0, elapsedDays: 0, scheduledDays: 0, reps: 0, lapses: 0, state: 0, lastReview: null }
const reviewed = { due: new Date('2026-06-28T00:00:00Z'), stability: 2, difficulty: 5, elapsedDays: 0, scheduledDays: 1, reps: 1, lapses: 0, state: 2, lastReview: now }

function deps(existing: any) {
  const learning = {
    getCard: vi.fn().mockResolvedValue(existing),
    saveCard: vi.fn().mockResolvedValue(undefined),
    getCardId: vi.fn().mockResolvedValue('c1'),
    createReviewLog: vi.fn().mockResolvedValue(undefined),
  }
  const scheduler = { newCard: vi.fn().mockReturnValue(newState), review: vi.fn().mockReturnValue(reviewed) }
  const bus = { publish: vi.fn().mockResolvedValue(undefined) }
  return { learning, scheduler, bus }
}

describe('submitReview', () => {
  it('creates a new card state when none exists, schedules, saves, logs, and publishes', async () => {
    const d = deps(null)
    const result = await submitReview({ userId: 'u1', wordId: 'w1', rating: 'good', now }, d as any)
    expect(d.scheduler.newCard).toHaveBeenCalledWith(now)
    expect(d.scheduler.review).toHaveBeenCalledWith(newState, 'good', now)
    // saveCard BEFORE createReviewLog (UserCard is the source of truth)
    expect(d.learning.saveCard).toHaveBeenCalledWith('u1', 'w1', reviewed)
    expect(d.learning.createReviewLog).toHaveBeenCalledWith(expect.objectContaining({ userCardId: 'c1', rating: 3, state: reviewed.state, due: reviewed.due }))
    expect(d.bus.publish).toHaveBeenCalledWith({ type: 'ReviewCompleted', userId: 'u1', wordId: 'w1', rating: 'good', at: now })
    expect(result).toEqual(reviewed)
  })

  it('uses the existing card state when present', async () => {
    const d = deps(newState)
    await submitReview({ userId: 'u1', wordId: 'w1', rating: 'again', now }, d as any)
    expect(d.scheduler.newCard).not.toHaveBeenCalled()
    expect(d.scheduler.review).toHaveBeenCalledWith(newState, 'again', now)
  })
})

describe('finishSession', () => {
  it('publishes SessionFinished', async () => {
    const bus = { publish: vi.fn().mockResolvedValue(undefined) }
    await finishSession({ userId: 'u1', reviewed: 7, now }, { bus } as any)
    expect(bus.publish).toHaveBeenCalledWith({ type: 'SessionFinished', userId: 'u1', reviewed: 7, at: now })
  })
})
