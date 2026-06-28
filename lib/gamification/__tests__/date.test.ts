import { describe, it, expect } from 'vitest'
import { todayYmd, daysBetween } from '@/lib/gamification/date'

describe('todayYmd', () => {
  it('formats in the given timezone (Asia/Taipei is UTC+8)', () => {
    // 2026-06-28T20:00:00Z => 台北已是 06-29 04:00
    expect(todayYmd(new Date('2026-06-28T20:00:00Z'), 'Asia/Taipei')).toBe('2026-06-29')
    // 同一時刻在 UTC 仍是 06-28
    expect(todayYmd(new Date('2026-06-28T20:00:00Z'), 'UTC')).toBe('2026-06-28')
  })
})

describe('daysBetween', () => {
  it('returns positive day delta', () => {
    expect(daysBetween('2026-06-27', '2026-06-28')).toBe(1)
    expect(daysBetween('2026-06-20', '2026-06-28')).toBe(8)
  })
  it('returns 0 for same day', () => {
    expect(daysBetween('2026-06-28', '2026-06-28')).toBe(0)
  })
})
