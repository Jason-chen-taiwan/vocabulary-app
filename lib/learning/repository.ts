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
    learningSteps: state.learningSteps,
    elapsedDays: state.elapsedDays, scheduledDays: state.scheduledDays,
    reps: state.reps, lapses: state.lapses, state: state.state, lastReview: state.lastReview,
  }
}

export interface ReviewLogInput {
  userCardId: string; rating: number; state: number; due: Date
  stability: number; difficulty: number; elapsedDays: number
  lastElapsedDays: number; scheduledDays: number
}

export class LearningRepository {
  private readonly db: LearningDb
  constructor(db?: LearningDb) {
    this.db = db ?? (getPrisma() as unknown as LearningDb)
  }

  async getCard(userId: string, wordId: string): Promise<CardState | null> {
    const row = await this.db.userCard.findUnique({ where: { userId_wordId: { userId, wordId } } })
    return row ? toCardState(row as Parameters<typeof toCardState>[0]) : null
  }

  async saveCard(userId: string, wordId: string, state: CardState, exists: boolean): Promise<string> {
    if (exists) {
      const row = (await this.db.userCard.update({ where: { userId_wordId: { userId, wordId } }, data: stateData(state) })) as { id: string }
      return row.id
    }
    const row = (await this.db.userCard.create({ data: { userId, wordId, ...stateData(state) } })) as { id: string }
    return row.id
  }

  async createReviewLog(input: ReviewLogInput): Promise<void> {
    await this.db.reviewLog.create({ data: input })
  }

  async listDueCards(userId: string, now: Date, limit: number): Promise<{ wordId: string; state: CardState }[]> {
    const rows = await this.db.userCard.findMany({ where: { userId, due: { lte: now } }, orderBy: { due: 'asc' }, take: limit })
    return (rows as ({ wordId: string } & Parameters<typeof toCardState>[0])[]).map((r) => ({ wordId: r.wordId, state: toCardState(r) }))
  }

  async listNewWordIds(userId: string, wordBookId: string, limit: number): Promise<string[]> {
    const rows = await this.db.word.findMany({
      where: { wordBookId, userCards: { none: { userId } } },
      orderBy: { order: 'asc' }, take: limit, select: { id: true },
    })
    return (rows as { id: string }[]).map((r) => r.id)
  }
}
