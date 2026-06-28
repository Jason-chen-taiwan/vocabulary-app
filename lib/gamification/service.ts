import { GamificationRepository } from './repository'
import { todayYmd, daysBetween } from './date'
import {
  xpForReview, levelForXp, updateStreak, evaluateBadges,
  COIN_DAILY_GOAL, COIN_MASTERY, FREEZE_PER_MILESTONE_DAYS, FREEZE_CAP,
} from './rules'
import type { GamificationStateData, ReviewReward } from './types'

const DEFAULT_STATE: GamificationStateData = {
  xp: 0, level: 1, coinBalance: 0, streak: 0, longestStreak: 0,
  lastGoalDate: null, reviewsToday: 0, lastReviewDate: null, streakFreezes: 0,
}

export class GamificationService {
  private readonly repo: GamificationRepository
  constructor(repo?: GamificationRepository) {
    this.repo = repo ?? new GamificationRepository()
  }

  async applyReview(input: { userId: string; correct: boolean; mastered: boolean; now: Date }): Promise<ReviewReward> {
    const { userId, correct, mastered, now } = input
    const ctx = await this.repo.getContext(userId)
    const exists = ctx.state !== null
    const prev = ctx.state ?? DEFAULT_STATE
    const today = todayYmd(now, ctx.timezone)

    // 跨日重置今日複習數
    const reviewsToday = (prev.lastReviewDate === today ? prev.reviewsToday : 0) + 1

    const xpGained = xpForReview(correct)
    const xp = prev.xp + xpGained
    const level = levelForXp(xp)
    const leveledUpTo = level > prev.level ? level : null

    let coinBalance = prev.coinBalance
    let coinsGained = 0
    if (mastered) {
      coinBalance += COIN_MASTERY
      coinsGained += COIN_MASTERY
    }

    let streak = prev.streak
    let longestStreak = prev.longestStreak
    let streakFreezes = prev.streakFreezes
    let lastGoalDate = prev.lastGoalDate
    let dailyGoalMet = false

    const alreadyMetToday = prev.lastGoalDate === today
    if (!alreadyMetToday && reviewsToday >= ctx.dailyGoal) {
      dailyGoalMet = true
      coinBalance += COIN_DAILY_GOAL
      coinsGained += COIN_DAILY_GOAL
      const days = prev.lastGoalDate ? daysBetween(prev.lastGoalDate, today) : null
      const su = updateStreak(days, streak, streakFreezes)
      streak = su.streak
      streakFreezes -= su.freezesConsumed
      if (streak % FREEZE_PER_MILESTONE_DAYS === 0 && streakFreezes < FREEZE_CAP) streakFreezes += 1
      longestStreak = Math.max(longestStreak, streak)
      lastGoalDate = today
    }

    // 徽章：streak/level 一律評估；mastered 觸發時才查精熟數
    const masteredCount = mastered ? await this.repo.countMastered(userId) : undefined
    const earned = evaluateBadges({ streak, level, masteredCount })
    const already = await this.repo.listBadgeKeys(userId)
    const newBadges = earned.filter((k) => !already.includes(k))

    const next: GamificationStateData = {
      xp, level, coinBalance, streak, longestStreak, lastGoalDate, reviewsToday, lastReviewDate: today, streakFreezes,
    }
    await this.repo.saveState(userId, next, exists)
    if (newBadges.length) await this.repo.unlockBadges(userId, newBadges)

    return { xpGained, coinsGained, leveledUpTo, dailyGoalMet, streak, newBadges }
  }
}

export const gamificationService = new GamificationService()
