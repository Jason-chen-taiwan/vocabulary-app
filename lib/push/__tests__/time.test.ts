import { describe, it, expect } from 'vitest'
import { utcHourFor, localDateString } from '../time'

describe('utcHourFor', () => {
  it('converts Taipei (UTC+8) 20:00 local to 12:00 UTC', () => {
    expect(utcHourFor(20, 8)).toBe(12)
  })
  it('wraps past midnight: Taipei 06:00 local -> 22:00 UTC', () => {
    expect(utcHourFor(6, 8)).toBe(22)
  })
  it('handles negative offset: EST (UTC-5) 20:00 -> 01:00 UTC', () => {
    expect(utcHourFor(20, -5)).toBe(1)
  })
})

describe('localDateString', () => {
  it('returns local calendar date for a UTC instant', () => {
    // 2026-07-17T23:30:00Z + 8h = 2026-07-18 07:30 local
    const ms = Date.UTC(2026, 6, 17, 23, 30)
    expect(localDateString(ms, 8)).toBe('2026-07-18')
  })
})
