import { describe, it, expect } from 'vitest'
import { grade, MASTERY_THRESHOLD } from '@/lib/learning/grading'

describe('grade', () => {
  it('wrong answer → again, streak resets to 0, not mastered', () => {
    expect(grade(false, 3)).toEqual({ rating: 'again', nextStreak: 0, mastered: false })
  })
  it('climbs hard → good → good → easy on the first four correct answers', () => {
    expect(grade(true, 0)).toEqual({ rating: 'hard', nextStreak: 1, mastered: false })
    expect(grade(true, 1)).toEqual({ rating: 'good', nextStreak: 2, mastered: false })
    expect(grade(true, 2)).toEqual({ rating: 'good', nextStreak: 3, mastered: false })
    expect(grade(true, 3)).toEqual({ rating: 'easy', nextStreak: 4, mastered: false })
  })
  it('fifth consecutive correct graduates to mastered (rated easy)', () => {
    expect(grade(true, 4)).toEqual({ rating: 'easy', nextStreak: 5, mastered: true })
  })
  it('a correct spot-check on an already-mastered card stays mastered', () => {
    expect(grade(true, 5)).toEqual({ rating: 'easy', nextStreak: 6, mastered: true })
  })
  it('a failed spot-check un-masters (again, streak 0)', () => {
    expect(grade(false, 6)).toEqual({ rating: 'again', nextStreak: 0, mastered: false })
  })
  it('MASTERY_THRESHOLD is 5', () => {
    expect(MASTERY_THRESHOLD).toBe(5)
  })
})
