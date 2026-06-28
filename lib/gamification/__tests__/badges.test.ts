import { describe, it, expect } from 'vitest'
import { BADGES } from '@/lib/gamification/badges'

describe('BADGES config', () => {
  it('has unique keys', () => {
    const keys = BADGES.map((b) => b.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
  it('covers the four badge types', () => {
    const types = new Set(BADGES.map((b) => b.type))
    expect(types).toEqual(new Set(['streak', 'mastered', 'level', 'perfect']))
  })
  it('includes the documented milestone keys', () => {
    const keys = BADGES.map((b) => b.key)
    for (const k of ['streak-7', 'streak-30', 'streak-100', 'mastered-10', 'mastered-50', 'mastered-100', 'level-5', 'level-10', 'level-25', 'perfect-session']) {
      expect(keys).toContain(k)
    }
  })
})
