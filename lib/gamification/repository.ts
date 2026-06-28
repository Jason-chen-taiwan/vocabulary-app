import { getPrisma } from '@/lib/db/client'
import type { GamificationStateData } from './types'

interface GamificationDb {
  user: { findUnique(args: unknown): Promise<unknown | null> }
  gamificationState: {
    create(args: unknown): Promise<unknown>
    update(args: unknown): Promise<unknown>
  }
  userCard: { count(args: unknown): Promise<number> }
  userBadge: {
    findMany(args: unknown): Promise<unknown[]>
    create(args: unknown): Promise<unknown>
  }
}

export class GamificationRepository {
  private readonly db: GamificationDb
  constructor(db?: GamificationDb) {
    this.db = db ?? (getPrisma() as unknown as GamificationDb)
  }

  async getContext(userId: string): Promise<{ state: GamificationStateData | null; timezone: string; dailyGoal: number }> {
    const row = (await this.db.user.findUnique({
      where: { id: userId },
      select: { timezone: true, dailyGoal: true, gamification: true },
    })) as { timezone: string; dailyGoal: number; gamification: GamificationStateData | null } | null
    if (!row) throw new Error(`user not found: ${userId}`)
    return { state: row.gamification, timezone: row.timezone, dailyGoal: row.dailyGoal }
  }

  async saveState(userId: string, data: GamificationStateData, exists: boolean): Promise<void> {
    if (exists) {
      await this.db.gamificationState.update({ where: { userId }, data })
      return
    }
    await this.db.gamificationState.create({ data: { userId, ...data } })
  }

  async countMastered(userId: string): Promise<number> {
    return this.db.userCard.count({ where: { userId, mastered: true } })
  }

  async listBadgeKeys(userId: string): Promise<string[]> {
    const rows = (await this.db.userBadge.findMany({ where: { userId }, select: { badgeKey: true } })) as { badgeKey: string }[]
    return rows.map((r) => r.badgeKey)
  }

  async unlockBadges(userId: string, keys: string[]): Promise<void> {
    for (const badgeKey of keys) {
      try {
        await this.db.userBadge.create({ data: { userId, badgeKey } })
      } catch {
        // ignore unique-constraint violation from a concurrent unlock; @@unique makes this idempotent
      }
    }
  }
}
