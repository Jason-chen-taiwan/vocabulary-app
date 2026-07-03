import { StatsRepository } from './repository'
import {
  groupReviewsByDay, dailyAccuracy, dueForecast, heatmapCells,
  countMasteredByBook, masteryByBook, stateCounts,
  type DayAccuracy, type DueBucket, type HeatCell, type BookMastery, type StateCounts,
} from './aggregate'

export const ACCURACY_DAYS = 30
export const HEATMAP_WEEKS = 12
export const FORECAST_DAYS = 7

export interface Dashboard {
  progress: { states: StateCounts; totalWords: number; byBook: BookMastery[] }
  activity: { cells: HeatCell[]; streak: number; longestStreak: number }
  accuracy: { daily: DayAccuracy[]; overallPct: number; window: number }
  dueForecast: DueBucket[]
}

const DAY_MS = 86_400_000

export class StatsService {
  private readonly repo: StatsRepository
  constructor(repo?: StatsRepository) {
    this.repo = repo ?? new StatsRepository()
  }

  async getDashboard(userId: string, now: Date, timezone: string): Promise<Dashboard> {
    const since = new Date(now.getTime() - HEATMAP_WEEKS * 7 * DAY_MS)
    const [logs, cards, books, streakInfo] = await Promise.all([
      this.repo.listReviewLogsSince(userId, since),
      this.repo.listUserCards(userId),
      this.repo.listBooksWithWordCounts(),
      this.repo.getStreak(userId),
    ])

    const totalWords = books.reduce((s, b) => s + b.wordCount, 0)
    const states = stateCounts(cards, totalWords)
    const byBook = masteryByBook(countMasteredByBook(cards), books)

    const cells = heatmapCells(groupReviewsByDay(logs, timezone), now, timezone, HEATMAP_WEEKS)

    const accSince = new Date(now.getTime() - ACCURACY_DAYS * DAY_MS)
    const recent = logs.filter((l) => l.reviewedAt >= accSince)
    const daily = dailyAccuracy(recent, timezone)
    const correct = recent.reduce((s, l) => s + (l.rating >= 2 ? 1 : 0), 0)
    const overallPct = recent.length > 0 ? Math.round((correct / recent.length) * 100) : 0

    return {
      progress: { states, totalWords, byBook },
      activity: { cells, streak: streakInfo.streak, longestStreak: streakInfo.longestStreak },
      accuracy: { daily, overallPct, window: ACCURACY_DAYS },
      dueForecast: dueForecast(cards.filter((c) => !c.mastered), now, timezone, FORECAST_DAYS),
    }
  }
}

export const statsService = new StatsService()
