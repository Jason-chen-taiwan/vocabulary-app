import { describe, it, expect, vi } from 'vitest'
import { LearningRepository } from '@/lib/learning/repository'

const now = new Date('2026-06-28T00:00:00Z')
const state = { due: now, stability: 1, difficulty: 5, learningSteps: 0, elapsedDays: 0, scheduledDays: 1, reps: 1, lapses: 0, state: 1, lastReview: now }
const stateData = { due: now, stability: 1, difficulty: 5, learningSteps: 0, elapsedDays: 0, scheduledDays: 1, reps: 1, lapses: 0, state: 1, lastReview: now }

function makeDb() {
  return {
    userCard: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    word: { findMany: vi.fn() },
    reviewLog: { create: vi.fn() },
  }
}

describe('LearningRepository', () => {
  it('getCard returns state + progression or null', async () => {
    const db = makeDb()
    db.userCard.findUnique.mockResolvedValue({ ...stateData, consecutiveCorrect: 2, mastered: false })
    const repo = new LearningRepository(db as any)
    expect(await repo.getCard('u1', 'w1')).toEqual({ state, consecutiveCorrect: 2, mastered: false })
    db.userCard.findUnique.mockResolvedValue(null)
    expect(await repo.getCard('u1', 'w2')).toBeNull()
  })

  it('saveCard update path writes state + progression and returns id', async () => {
    const db = makeDb(); db.userCard.update.mockResolvedValue({ id: 'c1' })
    const repo = new LearningRepository(db as any)
    const id = await repo.saveCard('u1', 'w1', state, { consecutiveCorrect: 3, mastered: false, exists: true })
    expect(id).toBe('c1')
    expect(db.userCard.update).toHaveBeenCalledWith({
      where: { userId_wordId: { userId: 'u1', wordId: 'w1' } },
      data: { ...stateData, consecutiveCorrect: 3, mastered: false },
    })
  })

  it('saveCard create path writes state + progression and returns id', async () => {
    const db = makeDb(); db.userCard.create.mockResolvedValue({ id: 'c2' })
    const repo = new LearningRepository(db as any)
    const id = await repo.saveCard('u1', 'w1', state, { consecutiveCorrect: 5, mastered: true, exists: false })
    expect(id).toBe('c2')
    expect(db.userCard.create).toHaveBeenCalledWith({
      data: { userId: 'u1', wordId: 'w1', ...stateData, consecutiveCorrect: 5, mastered: true },
    })
  })

  it('listDueCards excludes mastered and returns wordId + streak', async () => {
    const db = makeDb()
    db.userCard.findMany.mockResolvedValue([{ wordId: 'w1', consecutiveCorrect: 2 }])
    const repo = new LearningRepository(db as any)
    const result = await repo.listDueCards('u1', now, 50, 'b1')
    expect(db.userCard.findMany).toHaveBeenCalledWith({
      where: { userId: 'u1', mastered: false, due: { lte: now }, word: { wordBookId: 'b1' } },
      orderBy: { due: 'asc' }, take: 50, select: { wordId: true, consecutiveCorrect: true },
    })
    expect(result).toEqual([{ wordId: 'w1', consecutiveCorrect: 2 }])
  })

  it('listMasteredWordIds returns ids of mastered cards', async () => {
    const db = makeDb()
    db.userCard.findMany.mockResolvedValue([{ wordId: 'w9' }, { wordId: 'w8' }])
    const repo = new LearningRepository(db as any)
    expect(await repo.listMasteredWordIds('u1', 'b1')).toEqual(['w9', 'w8'])
    expect(db.userCard.findMany).toHaveBeenCalledWith({
      where: { userId: 'u1', mastered: true, word: { wordBookId: 'b1' } }, select: { wordId: true },
    })
  })

  it('listNewWordIds finds words with no card for the user', async () => {
    const db = makeDb()
    db.word.findMany.mockResolvedValue([{ id: 'w2' }])
    const repo = new LearningRepository(db as any)
    expect(await repo.listNewWordIds('u1', 'b1', 10)).toEqual(['w2'])
    expect(db.word.findMany).toHaveBeenCalledWith({
      where: { wordBookId: 'b1', userCards: { none: { userId: 'u1' } } },
      orderBy: { order: 'asc' }, take: 10, select: { id: true },
    })
  })

  it('mixed practice (no wordBookId) omits the book filter in all three queries', async () => {
    const db = makeDb()
    db.userCard.findMany.mockResolvedValue([])
    db.word.findMany.mockResolvedValue([])
    const repo = new LearningRepository(db as any)

    await repo.listDueCards('u1', now, 50)
    expect(db.userCard.findMany).toHaveBeenLastCalledWith({
      where: { userId: 'u1', mastered: false, due: { lte: now } },
      orderBy: { due: 'asc' }, take: 50, select: { wordId: true, consecutiveCorrect: true },
    })

    await repo.listMasteredWordIds('u1')
    expect(db.userCard.findMany).toHaveBeenLastCalledWith({
      where: { userId: 'u1', mastered: true }, select: { wordId: true },
    })

    await repo.listNewWordIds('u1', undefined, 10)
    expect(db.word.findMany).toHaveBeenLastCalledWith({
      where: { userCards: { none: { userId: 'u1' } } },
      orderBy: { order: 'asc' }, take: 10, select: { id: true },
    })
  })
})
