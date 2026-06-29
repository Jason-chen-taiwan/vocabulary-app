import { getPrisma } from '@/lib/db/client'

interface LbDb {
  gamificationState: {
    findMany(args: unknown): Promise<unknown[]>
    count(args: unknown): Promise<number>
    findUnique(args: unknown): Promise<unknown | null>
  }
}

type Row = { userId: string; user: { displayName: string | null; name: string | null } }

export class LeaderboardRepository {
  private readonly db: LbDb
  constructor(db?: LbDb) {
    this.db = db ?? (getPrisma() as unknown as LbDb)
  }
  async topAllTime(limit: number): Promise<(Row & { xp: number })[]> {
    return (await this.db.gamificationState.findMany({
      where: { user: { leaderboardOptIn: true } },
      orderBy: { xp: 'desc' }, take: limit,
      select: { userId: true, xp: true, user: { select: { displayName: true, name: true } } },
    })) as (Row & { xp: number })[]
  }
  async topWeekly(limit: number, weekStart: string): Promise<(Row & { weeklyXp: number })[]> {
    return (await this.db.gamificationState.findMany({
      where: { user: { leaderboardOptIn: true }, weekStartDate: weekStart },
      orderBy: { weeklyXp: 'desc' }, take: limit,
      select: { userId: true, weeklyXp: true, user: { select: { displayName: true, name: true } } },
    })) as (Row & { weeklyXp: number })[]
  }
  async countAboveAllTime(xp: number): Promise<number> {
    return this.db.gamificationState.count({ where: { user: { leaderboardOptIn: true }, xp: { gt: xp } } })
  }
  async countAboveWeekly(weeklyXp: number, weekStart: string): Promise<number> {
    return this.db.gamificationState.count({ where: { user: { leaderboardOptIn: true }, weekStartDate: weekStart, weeklyXp: { gt: weeklyXp } } })
  }
  async getStanding(userId: string): Promise<{ xp: number; weeklyXp: number; weekStartDate: string | null; optedIn: boolean }> {
    const row = (await this.db.gamificationState.findUnique({
      where: { userId },
      select: { xp: true, weeklyXp: true, weekStartDate: true, user: { select: { leaderboardOptIn: true } } },
    })) as { xp: number; weeklyXp: number; weekStartDate: string | null; user: { leaderboardOptIn: boolean } } | null
    if (!row) return { xp: 0, weeklyXp: 0, weekStartDate: null, optedIn: false }
    return { xp: row.xp, weeklyXp: row.weeklyXp, weekStartDate: row.weekStartDate, optedIn: row.user.leaderboardOptIn }
  }
}
