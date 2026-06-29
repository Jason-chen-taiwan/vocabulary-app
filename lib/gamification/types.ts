// 遊戲化模組對外型別。與 Prisma row 解耦：repository 負責 row→這些型別的轉換。
export interface GamificationStateData {
  xp: number
  level: number
  coinBalance: number
  streak: number
  longestStreak: number
  lastGoalDate: string | null
  reviewsToday: number
  lastReviewDate: string | null
  streakFreezes: number
  weeklyXp: number
  weekStartDate: string | null
}

// 單次作答的獎勵 delta，回傳給 UI 累加顯示。
export interface ReviewReward {
  xpGained: number
  coinsGained: number
  leveledUpTo: number | null
  dailyGoalMet: boolean
  streak: number
  newBadges: string[]
}

// session 結束結算。
export interface SessionReward {
  perfect: boolean
  newBadges: string[]
}

export interface BadgeDef {
  key: string
  name: string
  description: string
  type: 'streak' | 'mastered' | 'level' | 'perfect'
  threshold: number
}

export interface BadgeContext {
  streak: number
  level: number
  masteredCount?: number
  perfectSession?: boolean
}
