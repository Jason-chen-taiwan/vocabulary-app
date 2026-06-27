import { describe, it, expect } from 'vitest'
import { RATING_TO_INT, toCardState } from '@/lib/learning/types'

describe('RATING_TO_INT', () => {
  it('maps ratings to FSRS integers', () => {
    expect(RATING_TO_INT).toEqual({ again: 1, hard: 2, good: 3, easy: 4 })
  })
})

describe('toCardState', () => {
  it('maps a UserCard row to CardState (only the scheduling fields)', () => {
    const due = new Date('2026-07-01T00:00:00Z')
    const last = new Date('2026-06-27T00:00:00Z')
    const row = {
      id: 'c1', userId: 'u1', wordId: 'w1',
      due, stability: 3.5, difficulty: 5.2, elapsedDays: 1, scheduledDays: 4,
      reps: 2, lapses: 0, state: 2, learningSteps: 1, lastReview: last,
      createdAt: new Date(), updatedAt: new Date(),
    }
    expect(toCardState(row as any)).toEqual({
      due, stability: 3.5, difficulty: 5.2, elapsedDays: 1, scheduledDays: 4,
      reps: 2, lapses: 0, state: 2, learningSteps: 1, lastReview: last,
    })
  })

  it('keeps lastReview null when absent', () => {
    const due = new Date('2026-07-01T00:00:00Z')
    const row = { due, stability: 0, difficulty: 0, elapsedDays: 0, scheduledDays: 0, reps: 0, lapses: 0, state: 0, learningSteps: 0, lastReview: null }
    expect(toCardState(row as any).lastReview).toBeNull()
  })
})
