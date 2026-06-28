import { describe, it, expect, vi } from 'vitest'
import { GamificationRepository } from '@/lib/gamification/repository'

const stateData = {
  xp: 30, level: 1, coinBalance: 50, streak: 2, longestStreak: 3,
  lastGoalDate: '2026-06-27', reviewsToday: 5, lastReviewDate: '2026-06-28', streakFreezes: 1,
}

function makeDb() {
  return {
    user: { findUnique: vi.fn() },
    gamificationState: { create: vi.fn(), update: vi.fn() },
    userCard: { count: vi.fn() },
    userBadge: { findMany: vi.fn(), create: vi.fn() },
  }
}

describe('GamificationRepository', () => {
  it('getContext returns state + timezone + dailyGoal', async () => {
    const db = makeDb()
    db.user.findUnique.mockResolvedValue({ timezone: 'Asia/Taipei', dailyGoal: 20, gamification: stateData })
    const repo = new GamificationRepository(db as any)
    expect(await repo.getContext('u1')).toEqual({ state: stateData, timezone: 'Asia/Taipei', dailyGoal: 20 })
    expect(db.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'u1' },
      select: { timezone: true, dailyGoal: true, gamification: true },
    })
  })

  it('getContext returns null state when no gamification row yet', async () => {
    const db = makeDb()
    db.user.findUnique.mockResolvedValue({ timezone: 'UTC', dailyGoal: 20, gamification: null })
    const repo = new GamificationRepository(db as any)
    expect(await repo.getContext('u1')).toEqual({ state: null, timezone: 'UTC', dailyGoal: 20 })
  })

  it('saveState create path when not exists', async () => {
    const db = makeDb()
    const repo = new GamificationRepository(db as any)
    await repo.saveState('u1', stateData, false)
    expect(db.gamificationState.create).toHaveBeenCalledWith({ data: { userId: 'u1', ...stateData } })
    expect(db.gamificationState.update).not.toHaveBeenCalled()
  })

  it('saveState update path when exists', async () => {
    const db = makeDb()
    const repo = new GamificationRepository(db as any)
    await repo.saveState('u1', stateData, true)
    expect(db.gamificationState.update).toHaveBeenCalledWith({ where: { userId: 'u1' }, data: stateData })
    expect(db.gamificationState.create).not.toHaveBeenCalled()
  })

  it('countMastered counts mastered cards', async () => {
    const db = makeDb()
    db.userCard.count.mockResolvedValue(7)
    const repo = new GamificationRepository(db as any)
    expect(await repo.countMastered('u1')).toBe(7)
    expect(db.userCard.count).toHaveBeenCalledWith({ where: { userId: 'u1', mastered: true } })
  })

  it('listBadgeKeys returns unlocked keys', async () => {
    const db = makeDb()
    db.userBadge.findMany.mockResolvedValue([{ badgeKey: 'streak-7' }, { badgeKey: 'level-5' }])
    const repo = new GamificationRepository(db as any)
    expect(await repo.listBadgeKeys('u1')).toEqual(['streak-7', 'level-5'])
    expect(db.userBadge.findMany).toHaveBeenCalledWith({ where: { userId: 'u1' }, select: { badgeKey: true } })
  })

  it('unlockBadges creates one row per key', async () => {
    const db = makeDb()
    const repo = new GamificationRepository(db as any)
    await repo.unlockBadges('u1', ['streak-7', 'level-5'])
    expect(db.userBadge.create).toHaveBeenCalledTimes(2)
    expect(db.userBadge.create).toHaveBeenNthCalledWith(1, { data: { userId: 'u1', badgeKey: 'streak-7' } })
    expect(db.userBadge.create).toHaveBeenNthCalledWith(2, { data: { userId: 'u1', badgeKey: 'level-5' } })
  })

  it('getContext throws when the user is not found', async () => {
    const db = makeDb()
    db.user.findUnique.mockResolvedValue(null)
    const repo = new GamificationRepository(db as any)
    await expect(repo.getContext('missing')).rejects.toThrow('user not found')
  })
})
