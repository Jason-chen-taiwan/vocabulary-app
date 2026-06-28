import { describe, it, expect, vi } from 'vitest'
import { GamificationService } from '@/lib/gamification/service'

const now = new Date('2026-06-28T02:00:00Z') // 台北 06-28 10:00

function repoWith(state: any, opts: { dailyGoal?: number; mastered?: number; badges?: string[] } = {}) {
  return {
    getContext: vi.fn().mockResolvedValue({ state, timezone: 'Asia/Taipei', dailyGoal: opts.dailyGoal ?? 20 }),
    saveState: vi.fn().mockResolvedValue(undefined),
    countMastered: vi.fn().mockResolvedValue(opts.mastered ?? 0),
    listBadgeKeys: vi.fn().mockResolvedValue(opts.badges ?? []),
    unlockBadges: vi.fn().mockResolvedValue(undefined),
  }
}

const base = {
  xp: 0, level: 1, coinBalance: 0, streak: 0, longestStreak: 0,
  lastGoalDate: null, reviewsToday: 0, lastReviewDate: null, streakFreezes: 0,
}

describe('applyReview', () => {
  it('correct answer adds XP, no level up, creates state when none', async () => {
    const repo = repoWith(null)
    const svc = new GamificationService(repo as any)
    const r = await svc.applyReview({ userId: 'u1', correct: true, mastered: false, now })
    expect(r.xpGained).toBe(10)
    expect(r.leveledUpTo).toBeNull()
    expect(r.dailyGoalMet).toBe(false)
    // create path (exists=false)
    expect(repo.saveState).toHaveBeenCalledWith('u1', expect.objectContaining({ xp: 10, reviewsToday: 1, lastReviewDate: '2026-06-28' }), false)
  })

  it('resets reviewsToday on a new day', async () => {
    const repo = repoWith({ ...base, reviewsToday: 9, lastReviewDate: '2026-06-27' })
    const svc = new GamificationService(repo as any)
    await svc.applyReview({ userId: 'u1', correct: false, mastered: false, now })
    expect(repo.saveState).toHaveBeenCalledWith('u1', expect.objectContaining({ reviewsToday: 1 }), true)
  })

  it('mastered answer grants mastery coins', async () => {
    const repo = repoWith({ ...base }, { mastered: 3 })
    const svc = new GamificationService(repo as any)
    const r = await svc.applyReview({ userId: 'u1', correct: true, mastered: true, now })
    expect(r.coinsGained).toBe(20)
  })

  it('hitting daily goal grants coins, starts streak, sets lastGoalDate', async () => {
    const repo = repoWith({ ...base, reviewsToday: 19, lastReviewDate: '2026-06-28' }, { dailyGoal: 20 })
    const svc = new GamificationService(repo as any)
    const r = await svc.applyReview({ userId: 'u1', correct: true, mastered: false, now })
    expect(r.dailyGoalMet).toBe(true)
    expect(r.coinsGained).toBe(50)
    expect(r.streak).toBe(1)
    expect(repo.saveState).toHaveBeenCalledWith('u1', expect.objectContaining({ streak: 1, lastGoalDate: '2026-06-28', longestStreak: 1 }), true)
  })

  it('consecutive-day goal increments streak and unlocks streak-7 badge', async () => {
    // 已連 6 天，昨天達標；今天第 20 次達標 → streak 7
    const repo = repoWith(
      { ...base, streak: 6, longestStreak: 6, lastGoalDate: '2026-06-27', reviewsToday: 19, lastReviewDate: '2026-06-28' },
      { dailyGoal: 20 },
    )
    const svc = new GamificationService(repo as any)
    const r = await svc.applyReview({ userId: 'u1', correct: true, mastered: false, now })
    expect(r.streak).toBe(7)
    expect(r.newBadges).toContain('streak-7')
    expect(repo.unlockBadges).toHaveBeenCalledWith('u1', expect.arrayContaining(['streak-7']))
  })

  it('does not re-grant daily goal if already met today', async () => {
    const repo = repoWith({ ...base, reviewsToday: 25, lastReviewDate: '2026-06-28', lastGoalDate: '2026-06-28', streak: 3 }, { dailyGoal: 20 })
    const svc = new GamificationService(repo as any)
    const r = await svc.applyReview({ userId: 'u1', correct: true, mastered: false, now })
    expect(r.dailyGoalMet).toBe(false)
    expect(r.coinsGained).toBe(0)
  })

  it('grants a streak freeze at a 7-multiple milestone', async () => {
    const repo = repoWith(
      { ...base, streak: 6, longestStreak: 6, lastGoalDate: '2026-06-27', reviewsToday: 19, lastReviewDate: '2026-06-28', streakFreezes: 0 },
      { dailyGoal: 20 },
    )
    const svc = new GamificationService(repo as any)
    await svc.applyReview({ userId: 'u1', correct: true, mastered: false, now })
    expect(repo.saveState).toHaveBeenCalledWith('u1', expect.objectContaining({ streak: 7, streakFreezes: 1 }), true)
  })

  it('only queries countMastered when the review caused mastery', async () => {
    const repo = repoWith({ ...base })
    const svc = new GamificationService(repo as any)
    await svc.applyReview({ userId: 'u1', correct: true, mastered: false, now })
    expect(repo.countMastered).not.toHaveBeenCalled()
  })
})
