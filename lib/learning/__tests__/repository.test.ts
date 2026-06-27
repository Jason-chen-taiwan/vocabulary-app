import { describe, it, expect, vi } from 'vitest'
import { LearningRepository } from '@/lib/learning/repository'

const now = new Date('2026-06-27T00:00:00Z')
const state = { due: now, stability: 1, difficulty: 5, learningSteps: 0, elapsedDays: 0, scheduledDays: 1, reps: 1, lapses: 0, state: 1, lastReview: now }

function makeDb() {
  return {
    userCard: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    word: { findMany: vi.fn() },
    reviewLog: { create: vi.fn() },
  }
}

describe('LearningRepository', () => {
  it('getCard returns null when no card', async () => {
    const db = makeDb(); db.userCard.findUnique.mockResolvedValue(null)
    const repo = new LearningRepository(db as any)
    expect(await repo.getCard('u1', 'w1')).toBeNull()
    expect(db.userCard.findUnique).toHaveBeenCalledWith({ where: { userId_wordId: { userId: 'u1', wordId: 'w1' } } })
  })

  it('saveCard updates when the card exists', async () => {
    const db = makeDb(); db.userCard.findUnique.mockResolvedValue({ id: 'c1' })
    const repo = new LearningRepository(db as any)
    await repo.saveCard('u1', 'w1', state)
    expect(db.userCard.update).toHaveBeenCalledWith({
      where: { userId_wordId: { userId: 'u1', wordId: 'w1' } },
      data: { due: now, stability: 1, difficulty: 5, learningSteps: 0, elapsedDays: 0, scheduledDays: 1, reps: 1, lapses: 0, state: 1, lastReview: now },
    })
    expect(db.userCard.create).not.toHaveBeenCalled()
  })

  it('saveCard creates when the card does not exist', async () => {
    const db = makeDb(); db.userCard.findUnique.mockResolvedValue(null)
    const repo = new LearningRepository(db as any)
    await repo.saveCard('u1', 'w1', state)
    expect(db.userCard.create).toHaveBeenCalledWith({
      data: { userId: 'u1', wordId: 'w1', due: now, stability: 1, difficulty: 5, learningSteps: 0, elapsedDays: 0, scheduledDays: 1, reps: 1, lapses: 0, state: 1, lastReview: now },
    })
  })

  it('listDueCards maps rows to {wordId, state} ordered by due, limited', async () => {
    const db = makeDb()
    db.userCard.findMany.mockResolvedValue([{ wordId: 'w1', due: now, stability: 1, difficulty: 5, learningSteps: 0, elapsedDays: 0, scheduledDays: 1, reps: 1, lapses: 0, state: 2, lastReview: now }])
    const repo = new LearningRepository(db as any)
    const result = await repo.listDueCards('u1', now, 50)
    expect(db.userCard.findMany).toHaveBeenCalledWith({ where: { userId: 'u1', due: { lte: now } }, orderBy: { due: 'asc' }, take: 50 })
    expect(result).toEqual([{ wordId: 'w1', state: { due: now, stability: 1, difficulty: 5, learningSteps: 0, elapsedDays: 0, scheduledDays: 1, reps: 1, lapses: 0, state: 2, lastReview: now } }])
  })

  it('listNewWordIds finds words in the book with no card for the user', async () => {
    const db = makeDb()
    db.word.findMany.mockResolvedValue([{ id: 'w2' }, { id: 'w3' }])
    const repo = new LearningRepository(db as any)
    const ids = await repo.listNewWordIds('u1', 'b1', 10)
    expect(db.word.findMany).toHaveBeenCalledWith({
      where: { wordBookId: 'b1', userCards: { none: { userId: 'u1' } } },
      orderBy: { order: 'asc' }, take: 10, select: { id: true },
    })
    expect(ids).toEqual(['w2', 'w3'])
  })
})
