import type { Rating } from './types'

export const MASTERY_THRESHOLD = 5

export interface GradeResult {
  rating: Rating
  nextStreak: number
  mastered: boolean
}

export function grade(isCorrect: boolean, prevStreak: number): GradeResult {
  if (!isCorrect) {
    return { rating: 'again', nextStreak: 0, mastered: false }
  }
  const nextStreak = prevStreak + 1
  let rating: Rating
  if (nextStreak === 1) rating = 'hard'
  else if (nextStreak <= 3) rating = 'good'
  else rating = 'easy'
  return { rating, nextStreak, mastered: nextStreak >= MASTERY_THRESHOLD }
}
