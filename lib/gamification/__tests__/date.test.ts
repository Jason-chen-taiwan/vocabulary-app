import { describe, it, expect } from 'vitest'
import { todayYmd, daysBetween, weekStartYmd } from '@/lib/gamification/date'

describe('todayYmd', () => {
  it('formats in the given timezone (Asia/Taipei is UTC+8)', () => {
    // 2026-06-28T20:00:00Z => 台北已是 06-29 04:00
    expect(todayYmd(new Date('2026-06-28T20:00:00Z'), 'Asia/Taipei')).toBe('2026-06-29')
    // 同一時刻在 UTC 仍是 06-28
    expect(todayYmd(new Date('2026-06-28T20:00:00Z'), 'UTC')).toBe('2026-06-28')
  })
})

describe('weekStartYmd', () => {
  it('returns Monday of the week (UTC tz)', () => {
    // 2026-06-29 is a Monday
    expect(weekStartYmd(new Date('2026-06-29T10:00:00Z'), 'UTC')).toBe('2026-06-29')
    // 2026-07-01 Wed → same Monday
    expect(weekStartYmd(new Date('2026-07-01T10:00:00Z'), 'UTC')).toBe('2026-06-29')
    // 2026-06-28 Sunday → previous Monday 06-22
    expect(weekStartYmd(new Date('2026-06-28T10:00:00Z'), 'UTC')).toBe('2026-06-22')
  })
  it('respects timezone (Asia/Taipei crosses into Monday)', () => {
    // 2026-06-28T20:00Z = Mon 04:00 Taipei → that week's Monday 06-29
    expect(weekStartYmd(new Date('2026-06-28T20:00:00Z'), 'Asia/Taipei')).toBe('2026-06-29')
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
