import { describe, it, expect } from 'vitest'
import {
  dayKey, groupReviewsByDay, dailyAccuracy, dueForecast,
  countMasteredByBook, masteryByBook, stateCounts,
  heatLevel, heatmapCells,
} from '@/lib/stats/aggregate'

const TZ = 'UTC'

describe('dayKey', () => {
  it('formats a date to YYYY-MM-DD in tz', () => {
    expect(dayKey(new Date('2026-07-03T10:00:00Z'), TZ)).toBe('2026-07-03')
  })
})

describe('groupReviewsByDay', () => {
  it('counts reviews per day', () => {
    const m = groupReviewsByDay([
      { reviewedAt: new Date('2026-07-03T01:00:00Z') },
      { reviewedAt: new Date('2026-07-03T20:00:00Z') },
      { reviewedAt: new Date('2026-07-04T05:00:00Z') },
    ], TZ)
    expect(m.get('2026-07-03')).toBe(2)
    expect(m.get('2026-07-04')).toBe(1)
  })
})

describe('dailyAccuracy', () => {
  it('splits correct (rating>=2) vs total per day, ascending', () => {
    const out = dailyAccuracy([
      { reviewedAt: new Date('2026-07-03T01:00:00Z'), rating: 3 },
      { reviewedAt: new Date('2026-07-03T02:00:00Z'), rating: 1 },
      { reviewedAt: new Date('2026-07-02T02:00:00Z'), rating: 4 },
    ], TZ)
    expect(out).toEqual([
      { day: '2026-07-02', correct: 1, total: 1 },
      { day: '2026-07-03', correct: 1, total: 2 },
    ])
  })
})

describe('dueForecast', () => {
  const now = new Date('2026-07-04T08:00:00Z')
  it('buckets next N days, today absorbs overdue, zero-fills', () => {
    const out = dueForecast([
      { due: new Date('2026-07-01T00:00:00Z') }, // overdue -> today
      { due: new Date('2026-07-04T23:00:00Z') }, // today
      { due: new Date('2026-07-06T10:00:00Z') }, // +2
      { due: new Date('2026-08-01T00:00:00Z') }, // beyond -> ignored
    ], now, TZ, 7)
    expect(out.length).toBe(7)
    expect(out[0]).toEqual({ day: '2026-07-04', count: 2 })
    expect(out[2]).toEqual({ day: '2026-07-06', count: 1 })
    expect(out[1]).toEqual({ day: '2026-07-05', count: 0 })
  })
})

describe('countMasteredByBook + masteryByBook', () => {
  it('counts mastered per book and computes pct', () => {
    const counts = countMasteredByBook([
      { mastered: true, wordBookId: 'b1' },
      { mastered: true, wordBookId: 'b1' },
      { mastered: false, wordBookId: 'b1' },
      { mastered: true, wordBookId: 'b2' },
    ])
    const out = masteryByBook(counts, [
      { id: 'b1', slug: 'office', name: '辦公室', wordCount: 4 },
      { id: 'b2', slug: 'finance', name: '財務', wordCount: 0 },
    ])
    expect(out[0]).toEqual({ slug: 'office', name: '辦公室', mastered: 2, total: 4, pct: 50 })
    expect(out[1]).toEqual({ slug: 'finance', name: '財務', mastered: 1, total: 0, pct: 0 })
  })
})

describe('stateCounts', () => {
  it('classifies mastered/review/learning and derives new', () => {
    const out = stateCounts([
      { state: 2, mastered: true },
      { state: 2, mastered: false },
      { state: 1, mastered: false },
      { state: 3, mastered: false },
    ], 10)
    expect(out).toEqual({ newCount: 6, learning: 2, review: 1, mastered: 1, startedTotal: 4 })
  })
})

describe('heatLevel + heatmapCells', () => {
  it('maps counts to levels', () => {
    expect(heatLevel(0)).toBe(0)
    expect(heatLevel(1)).toBe(1)
    expect(heatLevel(3)).toBe(2)
    expect(heatLevel(6)).toBe(3)
  })
  it('produces weeks*7 cells ending today, oldest first', () => {
    const now = new Date('2026-07-04T08:00:00Z')
    const byDay = new Map<string, number>([['2026-07-04', 5], ['2026-06-30', 1]])
    const cells = heatmapCells(byDay, now, TZ, 2) // 14 cells
    expect(cells.length).toBe(14)
    expect(cells[13]).toEqual({ day: '2026-07-04', count: 5, level: 2 })
    expect(cells[0].day).toBe('2026-06-21')
    expect(cells.find((c) => c.day === '2026-06-30')).toEqual({ day: '2026-06-30', count: 1, level: 1 })
  })
})
