import { describe, it, expect, vi } from 'vitest'
import { GamificationService } from '@/lib/gamification/service'
import { weekStartYmd } from '@/lib/gamification/date'

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
  weeklyXp: 0, weekStartDate: null,
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

  it('lapsed streak beyond freeze coverage resets streak to 1 and zeroes freezes', async () => {
    // last goal 2026-06-24 (4 days before today 06-28 → gap 3 > 1 freeze); 19 reviews already today
    const repo = repoWith(
      { ...base, streak: 10, longestStreak: 10, lastGoalDate: '2026-06-24', reviewsToday: 19, lastReviewDate: '2026-06-28', streakFreezes: 1 },
      { dailyGoal: 20 },
    )
    const svc = new GamificationService(repo as any)
    const r = await svc.applyReview({ userId: 'u1', correct: true, mastered: false, now })
    expect(r.dailyGoalMet).toBe(true)
    expect(r.streak).toBe(1)
    expect(repo.saveState).toHaveBeenCalledWith('u1', expect.objectContaining({ streak: 1, streakFreezes: 0, longestStreak: 10 }), true)
  })

  it('accumulates weeklyXp and resets on a new week', async () => {
    // now = 2026-06-29 (Mon) Asia/Taipei → weekStart 2026-06-29; prev week differs → reset then +10
    const repo = repoWith({ ...base, weeklyXp: 99, weekStartDate: '2026-06-22' })
    const svc = new GamificationService(repo as any)
    await svc.applyReview({ userId: 'u1', correct: true, mastered: false, now: new Date('2026-06-29T02:00:00Z') })
    expect(repo.saveState).toHaveBeenCalledWith('u1', expect.objectContaining({ weeklyXp: 10, weekStartDate: '2026-06-29' }), true)
  })
  it('adds to weeklyXp within the same week', async () => {
    const repo = repoWith({ ...base, weeklyXp: 40, weekStartDate: '2026-06-29' })
    const svc = new GamificationService(repo as any)
    await svc.applyReview({ userId: 'u1', correct: false, mastered: false, now: new Date('2026-06-30T02:00:00Z') })
    expect(repo.saveState).toHaveBeenCalledWith('u1', expect.objectContaining({ weeklyXp: 42, weekStartDate: '2026-06-29' }), true)
  })
})

describe('applySessionFinish', () => {
  it('perfect session unlocks perfect-session badge', async () => {
    const repo = repoWith({ ...base, streak: 1, level: 1 })
    const svc = new GamificationService(repo as any)
    const r = await svc.applySessionFinish({ userId: 'u1', reviewed: 5, correct: 5, now })
    expect(r.perfect).toBe(true)
    expect(r.newBadges).toContain('perfect-session')
    expect(repo.unlockBadges).toHaveBeenCalledWith('u1', ['perfect-session'])
  })

  it('non-perfect session unlocks nothing', async () => {
    const repo = repoWith({ ...base, streak: 1, level: 1 })
    const svc = new GamificationService(repo as any)
    const r = await svc.applySessionFinish({ userId: 'u1', reviewed: 5, correct: 4, now })
    expect(r.perfect).toBe(false)
    expect(r.newBadges).toEqual([])
    expect(repo.unlockBadges).not.toHaveBeenCalled()
  })

  it('empty session is not perfect', async () => {
    const repo = repoWith({ ...base, streak: 1, level: 1 })
    const svc = new GamificationService(repo as any)
    const r = await svc.applySessionFinish({ userId: 'u1', reviewed: 0, correct: 0, now })
    expect(r.perfect).toBe(false)
  })

  it('already-unlocked perfect badge is not re-added', async () => {
    const repo = repoWith({ ...base, streak: 1, level: 1 }, { badges: ['perfect-session'] })
    const svc = new GamificationService(repo as any)
    const r = await svc.applySessionFinish({ userId: 'u1', reviewed: 3, correct: 3, now })
    expect(r.perfect).toBe(true)
    expect(r.newBadges).toEqual([])
    expect(repo.unlockBadges).not.toHaveBeenCalled()
  })
})

describe('applyPassageFinish', () => {
  it('XP = 15 + 5×答對數，累入 xp 與 weeklyXp，可升級', () => {
    const repo = repoWith({ ...base, xp: 95, level: 1, weeklyXp: 10, weekStartDate: weekStartYmd(now, 'Asia/Taipei') })
    const svc = new GamificationService(repo as any)
    return svc.applyPassageFinish({ userId: 'u1', correctCount: 3, now }).then((r) => {
      expect(r.xpGained).toBe(30)
      expect(r.leveledUpTo).toBe(2) // 95+30=125 → level 2
      const saved = repo.saveState.mock.calls[0][1]
      expect(saved.xp).toBe(125)
      expect(saved.weeklyXp).toBe(40)
      expect(saved.coinBalance).toBe(base.coinBalance) // 不發幣
      expect(saved.streak).toBe(base.streak)           // 不動 streak
    })
  })

  it('首次（無 state）也可運作', async () => {
    const repo = repoWith(null)
    const svc = new GamificationService(repo as any)
    const r = await svc.applyPassageFinish({ userId: 'u1', correctCount: 0, now })
    expect(r.xpGained).toBe(15)
    expect(repo.saveState).toHaveBeenCalledWith('u1', expect.objectContaining({ xp: 15 }), false)
  })
})
