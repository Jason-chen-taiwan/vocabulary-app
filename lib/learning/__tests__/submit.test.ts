import { describe, it, expect, vi } from 'vitest'
import { submitAnswer, finishSession } from '@/lib/learning/submit'

const now = new Date('2026-06-28T00:00:00Z')
const newState = { due: now, stability: 0, difficulty: 0, learningSteps: 0, elapsedDays: 0, scheduledDays: 0, reps: 0, lapses: 0, state: 0, lastReview: null }
const reviewed = { due: new Date('2026-06-29T00:00:00Z'), stability: 2, difficulty: 5, learningSteps: 0, elapsedDays: 0, scheduledDays: 1, reps: 1, lapses: 0, state: 2, lastReview: now }

function deps(existing: any) {
  const learning = {
    getCard: vi.fn().mockResolvedValue(existing),
    saveCard: vi.fn().mockResolvedValue('c1'),
    createReviewLog: vi.fn().mockResolvedValue(undefined),
  }
  const scheduler = { newCard: vi.fn().mockReturnValue(newState), review: vi.fn().mockReturnValue(reviewed) }
  const bus = { publish: vi.fn().mockResolvedValue(undefined) }
  return { learning, scheduler, bus }
}

describe('submitAnswer', () => {
  it('correct on a new card: hard rating, streak 1, saves progression, logs, publishes', async () => {
    const d = deps(null)
    const result = await submitAnswer({ userId: 'u1', wordId: 'w1', correct: true, now }, d as any)
    expect(d.scheduler.newCard).toHaveBeenCalledWith(now)
    expect(d.scheduler.review).toHaveBeenCalledWith(newState, 'hard', now)
    expect(d.learning.saveCard).toHaveBeenCalledWith('u1', 'w1', reviewed, { consecutiveCorrect: 1, mastered: false, exists: false })
    expect(d.learning.createReviewLog).toHaveBeenCalledWith(expect.objectContaining({ userCardId: 'c1', rating: 2 }))
    expect(d.bus.publish).toHaveBeenCalledWith({ type: 'ReviewCompleted', userId: 'u1', wordId: 'w1', rating: 'hard', correct: true, mastered: false, at: now })
    expect(result).toEqual({ mastered: false })
  })

  it('fifth correct graduates: easy rating, mastered true', async () => {
    const d = deps({ state: newState, consecutiveCorrect: 4, mastered: false })
    const result = await submitAnswer({ userId: 'u1', wordId: 'w1', correct: true, now }, d as any)
    expect(d.scheduler.review).toHaveBeenCalledWith(newState, 'easy', now)
    expect(d.learning.saveCard).toHaveBeenCalledWith('u1', 'w1', reviewed, { consecutiveCorrect: 5, mastered: true, exists: true })
    expect(result).toEqual({ mastered: true })
  })

  it('wrong answer: again rating, streak reset, mastered false', async () => {
    const d = deps({ state: newState, consecutiveCorrect: 6, mastered: true })
    const result = await submitAnswer({ userId: 'u1', wordId: 'w1', correct: false, now }, d as any)
    expect(d.scheduler.review).toHaveBeenCalledWith(newState, 'again', now)
    expect(d.learning.saveCard).toHaveBeenCalledWith('u1', 'w1', reviewed, { consecutiveCorrect: 0, mastered: false, exists: true })
    expect(result).toEqual({ mastered: false })
  })

  it('clientRef 有給時寫進 review log', async () => {
    const d = deps(null)
    await submitAnswer({ userId: 'u1', wordId: 'w1', correct: true, now, clientRef: 'uuid-9' }, d as any)
    expect(d.learning.createReviewLog).toHaveBeenCalledWith(expect.objectContaining({ clientRef: 'uuid-9' }))
  })
})

describe('finishSession', () => {
  it('publishes SessionFinished', async () => {
    const bus = { publish: vi.fn().mockResolvedValue(undefined) }
    await finishSession({ userId: 'u1', reviewed: 7, correct: 6, now }, { bus } as any)
    expect(bus.publish).toHaveBeenCalledWith({ type: 'SessionFinished', userId: 'u1', reviewed: 7, correct: 6, at: now })
  })
})
