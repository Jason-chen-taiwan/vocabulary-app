import { describe, it, expect, vi } from 'vitest'
import { StatsService } from '@/lib/stats/service'

const now = new Date('2026-07-04T08:00:00Z')
const TZ = 'UTC'

function makeRepo(over: Partial<Record<string, any>> = {}) {
  return {
    listReviewLogsSince: vi.fn().mockResolvedValue([
      { reviewedAt: new Date('2026-07-04T01:00:00Z'), rating: 3 },
      { reviewedAt: new Date('2026-07-04T02:00:00Z'), rating: 1 },
      { reviewedAt: new Date('2026-07-03T02:00:00Z'), rating: 4 },
    ]),
    listUserCards: vi.fn().mockResolvedValue([
      { state: 2, mastered: true, due: new Date('2026-07-04T23:00:00Z'), wordBookId: 'b1' },
      { state: 1, mastered: false, due: new Date('2026-07-06T00:00:00Z'), wordBookId: 'b1' },
    ]),
    listBooksWithWordCounts: vi.fn().mockResolvedValue([
      { id: 'b1', slug: 'office', name: '辦公室', wordCount: 4 },
    ]),
    getStreak: vi.fn().mockResolvedValue({ streak: 3, longestStreak: 9 }),
    ...over,
  }
}

describe('StatsService.getDashboard', () => {
  it('composes the four view models', async () => {
    const svc = new StatsService(makeRepo() as any)
    const d = await svc.getDashboard('u1', now, TZ)

    // progress
    expect(d.progress.totalWords).toBe(4)
    expect(d.progress.states).toEqual({ newCount: 2, learning: 1, review: 0, mastered: 1, startedTotal: 2 })
    expect(d.progress.byBook).toEqual([{ slug: 'office', name: '辦公室', mastered: 1, total: 4, pct: 25 }])

    // activity
    expect(d.activity.cells.length).toBe(12 * 7)
    expect(d.activity.cells[d.activity.cells.length - 1]).toMatchObject({ day: '2026-07-04', count: 2 })
    expect(d.activity.streak).toBe(3)
    expect(d.activity.longestStreak).toBe(9)

    // accuracy (window 30)
    expect(d.accuracy.window).toBe(30)
    expect(d.accuracy.overallPct).toBe(67) // 2 correct of 3
    expect(d.accuracy.daily).toEqual([
      { day: '2026-07-03', correct: 1, total: 1 },
      { day: '2026-07-04', correct: 1, total: 2 },
    ])

    // due forecast (7 buckets, today absorbs overdue)
    expect(d.dueForecast.length).toBe(7)
    expect(d.dueForecast[0]).toEqual({ day: '2026-07-04', count: 1 })
    expect(d.dueForecast[2]).toEqual({ day: '2026-07-06', count: 1 })
  })

  it('requests review logs since ~12 weeks before now', async () => {
    const repo = makeRepo()
    const svc = new StatsService(repo as any)
    await svc.getDashboard('u1', now, TZ)
    const since = repo.listReviewLogsSince.mock.calls[0][1] as Date
    const deltaDays = Math.round((now.getTime() - since.getTime()) / 86_400_000)
    expect(deltaDays).toBe(12 * 7)
  })
})
