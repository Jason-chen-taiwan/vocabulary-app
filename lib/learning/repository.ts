import { getPrisma } from '@/lib/db/client'
import { toCardState, type CardState } from './types'

interface LearningDb {
  userCard: {
    findUnique(args: unknown): Promise<unknown | null>
    create(args: unknown): Promise<unknown>
    update(args: unknown): Promise<unknown>
    findMany(args: unknown): Promise<unknown[]>
  }
  word: { findMany(args: unknown): Promise<unknown[]> }
  reviewLog: { create(args: unknown): Promise<unknown> }
}

function stateData(state: CardState) {
  return {
    due: state.due, stability: state.stability, difficulty: state.difficulty,
    learningSteps: state.learningSteps, elapsedDays: state.elapsedDays, scheduledDays: state.scheduledDays,
    reps: state.reps, lapses: state.lapses, state: state.state, lastReview: state.lastReview,
  }
}

export interface ReviewLogInput {
  userCardId: string; rating: number; state: number; due: Date
  stability: number; difficulty: number; elapsedDays: number
  lastElapsedDays: number; scheduledDays: number
}

export interface CardProgress {
  consecutiveCorrect: number
  mastered: boolean
  exists: boolean
}

export class LearningRepository {
  private readonly db: LearningDb
  constructor(db?: LearningDb) {
    this.db = db ?? (getPrisma() as unknown as LearningDb)
  }

  async getCard(userId: string, wordId: string): Promise<{ state: CardState; consecutiveCorrect: number; mastered: boolean } | null> {
    const row = (await this.db.userCard.findUnique({ where: { userId_wordId: { userId, wordId } } })) as
      (Parameters<typeof toCardState>[0] & { consecutiveCorrect: number; mastered: boolean }) | null
    if (!row) return null
    return { state: toCardState(row), consecutiveCorrect: row.consecutiveCorrect, mastered: row.mastered }
  }

  async saveCard(userId: string, wordId: string, state: CardState, progress: CardProgress): Promise<string> {
    const data = { ...stateData(state), consecutiveCorrect: progress.consecutiveCorrect, mastered: progress.mastered }
    if (progress.exists) {
      const row = (await this.db.userCard.update({ where: { userId_wordId: { userId, wordId } }, data })) as { id: string }
      return row.id
    }
    const row = (await this.db.userCard.create({ data: { userId, wordId, ...data } })) as { id: string }
    return row.id
  }

  async createReviewLog(input: ReviewLogInput): Promise<void> {
    await this.db.reviewLog.create({ data: input })
  }

  // wordBookId omitted → mixed practice across every word book.
  async listDueCards(userId: string, now: Date, limit: number, wordBookId?: string): Promise<{ wordId: string; consecutiveCorrect: number }[]> {
    const rows = await this.db.userCard.findMany({
      where: { userId, mastered: false, due: { lte: now }, ...(wordBookId ? { word: { wordBookId } } : {}) },
      orderBy: { due: 'asc' }, take: limit, select: { wordId: true, consecutiveCorrect: true },
    })
    return rows as { wordId: string; consecutiveCorrect: number }[]
  }

  async listMasteredWordIds(userId: string, wordBookId?: string): Promise<string[]> {
    const rows = await this.db.userCard.findMany({ where: { userId, mastered: true, ...(wordBookId ? { word: { wordBookId } } : {}) }, select: { wordId: true } })
    return (rows as { wordId: string }[]).map((r) => r.wordId)
  }

  async listNewWordIds(userId: string, wordBookId: string | undefined, limit: number): Promise<string[]> {
    const rows = await this.db.word.findMany({
      where: { ...(wordBookId ? { wordBookId } : {}), userCards: { none: { userId } } },
      orderBy: { order: 'asc' }, take: limit, select: { id: true },
    })
    return (rows as { id: string }[]).map((r) => r.id)
  }
}
