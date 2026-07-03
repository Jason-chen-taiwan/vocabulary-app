import { getPrisma } from '@/lib/db/client'

interface StatsDb {
  reviewLog: { findMany(args: unknown): Promise<unknown[]> }
  userCard: { findMany(args: unknown): Promise<unknown[]> }
  wordBook: { findMany(args: unknown): Promise<unknown[]> }
  gamificationState: { findUnique(args: unknown): Promise<unknown | null> }
}

export interface ReviewLogRow { reviewedAt: Date; rating: number }
export interface UserCardRow { state: number; mastered: boolean; due: Date; wordBookId: string }
export interface BookRow { id: string; slug: string; name: string; wordCount: number }

export class StatsRepository {
  private readonly db: StatsDb
  constructor(db?: StatsDb) {
    this.db = db ?? (getPrisma() as unknown as StatsDb)
  }

  async listReviewLogsSince(userId: string, since: Date): Promise<ReviewLogRow[]> {
    return (await this.db.reviewLog.findMany({
      where: { userCard: { userId }, reviewedAt: { gte: since } },
      select: { reviewedAt: true, rating: true },
    })) as ReviewLogRow[]
  }

  async listUserCards(userId: string): Promise<UserCardRow[]> {
    const rows = (await this.db.userCard.findMany({
      where: { userId },
      select: { state: true, mastered: true, due: true, word: { select: { wordBookId: true } } },
    })) as { state: number; mastered: boolean; due: Date; word: { wordBookId: string } }[]
    return rows.map((r) => ({ state: r.state, mastered: r.mastered, due: r.due, wordBookId: r.word.wordBookId }))
  }

  async listBooksWithWordCounts(): Promise<BookRow[]> {
    const rows = (await this.db.wordBook.findMany({
      orderBy: { order: 'asc' },
      select: { id: true, slug: true, name: true, _count: { select: { words: true } } },
    })) as { id: string; slug: string; name: string; _count: { words: number } }[]
    return rows.map((r) => ({ id: r.id, slug: r.slug, name: r.name, wordCount: r._count.words }))
  }

  async getStreak(userId: string): Promise<{ streak: number; longestStreak: number }> {
    const row = (await this.db.gamificationState.findUnique({
      where: { userId }, select: { streak: true, longestStreak: true },
    })) as { streak: number; longestStreak: number } | null
    return { streak: row?.streak ?? 0, longestStreak: row?.longestStreak ?? 0 }
  }
}
