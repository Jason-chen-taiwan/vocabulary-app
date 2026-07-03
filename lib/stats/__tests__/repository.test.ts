import { describe, it, expect, vi } from 'vitest'
import { StatsRepository } from '@/lib/stats/repository'

function makeDb() {
  return {
    reviewLog: { findMany: vi.fn() },
    userCard: { findMany: vi.fn() },
    wordBook: { findMany: vi.fn() },
    gamificationState: { findUnique: vi.fn() },
  }
}

describe('StatsRepository', () => {
  it('listReviewLogsSince filters by user (via userCard) + since', async () => {
    const db = makeDb()
    const since = new Date('2026-06-01T00:00:00Z')
    db.reviewLog.findMany.mockResolvedValue([{ reviewedAt: new Date('2026-06-02T00:00:00Z'), rating: 3 }])
    const repo = new StatsRepository(db as any)
    const out = await repo.listReviewLogsSince('u1', since)
    expect(out).toEqual([{ reviewedAt: new Date('2026-06-02T00:00:00Z'), rating: 3 }])
    expect(db.reviewLog.findMany).toHaveBeenCalledWith({
      where: { userCard: { userId: 'u1' }, reviewedAt: { gte: since } },
      select: { reviewedAt: true, rating: true },
    })
  })

  it('listUserCards flattens word.wordBookId', async () => {
    const db = makeDb()
    db.userCard.findMany.mockResolvedValue([
      { state: 2, mastered: true, due: new Date('2026-07-05T00:00:00Z'), word: { wordBookId: 'b1' } },
    ])
    const repo = new StatsRepository(db as any)
    expect(await repo.listUserCards('u1')).toEqual([
      { state: 2, mastered: true, due: new Date('2026-07-05T00:00:00Z'), wordBookId: 'b1' },
    ])
    expect(db.userCard.findMany).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      select: { state: true, mastered: true, due: true, word: { select: { wordBookId: true } } },
    })
  })

  it('listBooksWithWordCounts maps _count.words to wordCount', async () => {
    const db = makeDb()
    db.wordBook.findMany.mockResolvedValue([{ id: 'b1', slug: 'office', name: '辦公室', _count: { words: 12 } }])
    const repo = new StatsRepository(db as any)
    expect(await repo.listBooksWithWordCounts()).toEqual([{ id: 'b1', slug: 'office', name: '辦公室', wordCount: 12 }])
    expect(db.wordBook.findMany).toHaveBeenCalledWith({
      orderBy: { order: 'asc' },
      select: { id: true, slug: true, name: true, _count: { select: { words: true } } },
    })
  })

  it('getStreak reads gamificationState, defaults 0 when no row', async () => {
    const db = makeDb()
    db.gamificationState.findUnique.mockResolvedValue(null)
    const repo = new StatsRepository(db as any)
    expect(await repo.getStreak('u1')).toEqual({ streak: 0, longestStreak: 0 })
    db.gamificationState.findUnique.mockResolvedValue({ streak: 4, longestStreak: 9 })
    expect(await repo.getStreak('u1')).toEqual({ streak: 4, longestStreak: 9 })
    expect(db.gamificationState.findUnique).toHaveBeenLastCalledWith({
      where: { userId: 'u1' }, select: { streak: true, longestStreak: true },
    })
  })
})
