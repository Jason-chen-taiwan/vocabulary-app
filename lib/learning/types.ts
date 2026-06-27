export type Rating = 'again' | 'hard' | 'good' | 'easy'
export type ReviewMode = 'recognition' | 'recall' | 'listening'

export const RATING_TO_INT: Record<Rating, number> = { again: 1, hard: 2, good: 3, easy: 4 }

export interface CardState {
  due: Date
  stability: number
  difficulty: number
  elapsedDays: number
  scheduledDays: number
  reps: number
  lapses: number
  state: number
  lastReview: Date | null
}

type UserCardRow = {
  due: Date; stability: number; difficulty: number; elapsedDays: number
  scheduledDays: number; reps: number; lapses: number; state: number; lastReview: Date | null
}

export function toCardState(row: UserCardRow): CardState {
  return {
    due: row.due, stability: row.stability, difficulty: row.difficulty,
    elapsedDays: row.elapsedDays, scheduledDays: row.scheduledDays,
    reps: row.reps, lapses: row.lapses, state: row.state, lastReview: row.lastReview,
  }
}
