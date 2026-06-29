import { LeaderboardRepository } from './repository'
import { rankFromCountAbove, displayNameOf } from './rank'
import { weekStartYmd } from '@/lib/gamification/date'

export interface BoardEntry { rank: number; name: string; value: number; isMe: boolean }
export interface Board { entries: BoardEntry[]; myRank: number | null; optedIn: boolean }

export class LeaderboardService {
  private readonly repo: LeaderboardRepository
  constructor(repo?: LeaderboardRepository) {
    this.repo = repo ?? new LeaderboardRepository()
  }
  async getBoard(userId: string, tab: 'weekly' | 'allTime', now: Date, timezone: string): Promise<Board> {
    const standing = await this.repo.getStanding(userId)
    if (tab === 'weekly') {
      const weekStart = weekStartYmd(now, timezone)
      const top = await this.repo.topWeekly(50, weekStart)
      const myWeekly = standing.weekStartDate === weekStart ? standing.weeklyXp : 0
      const above = await this.repo.countAboveWeekly(myWeekly, weekStart)
      return {
        entries: top.map((r, i) => ({ rank: i + 1, name: displayNameOf(r.user), value: r.weeklyXp, isMe: r.userId === userId })),
        myRank: standing.optedIn ? rankFromCountAbove(above) : null,
        optedIn: standing.optedIn,
      }
    }
    const top = await this.repo.topAllTime(50)
    const above = await this.repo.countAboveAllTime(standing.xp)
    return {
      entries: top.map((r, i) => ({ rank: i + 1, name: displayNameOf(r.user), value: r.xp, isMe: r.userId === userId })),
      myRank: standing.optedIn ? rankFromCountAbove(above) : null,
      optedIn: standing.optedIn,
    }
  }
}

export const leaderboardService = new LeaderboardService()
