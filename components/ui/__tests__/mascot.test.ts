import { describe, it, expect } from 'vitest'
import { MASCOT_MOODS, moodForHome, moodForSessionEnd } from '@/components/ui/mascot'

describe('MASCOT_MOODS', () => {
  it('lists the four moods', () => {
    expect([...MASCOT_MOODS].sort()).toEqual(['cheer', 'encourage', 'hi', 'sad'])
  })
})

describe('moodForHome', () => {
  it('goal met → cheer (takes priority)', () => {
    expect(moodForHome({ goalMet: true, streak: 0, longestStreak: 9 })).toBe('cheer')
  })
  it('broken streak (now 0 but had one) → sad', () => {
    expect(moodForHome({ goalMet: false, streak: 0, longestStreak: 5 })).toBe('sad')
  })
  it('brand-new user (0/0) → hi, not sad', () => {
    expect(moodForHome({ goalMet: false, streak: 0, longestStreak: 0 })).toBe('hi')
  })
  it('active streak, goal not yet met → hi', () => {
    expect(moodForHome({ goalMet: false, streak: 3, longestStreak: 5 })).toBe('hi')
  })
})

describe('moodForSessionEnd', () => {
  it('all correct → cheer', () => {
    expect(moodForSessionEnd({ correct: 12, total: 12 })).toBe('cheer')
  })
  it('below half correct → encourage', () => {
    expect(moodForSessionEnd({ correct: 3, total: 12 })).toBe('encourage')
  })
  it('decent but not perfect → cheer', () => {
    expect(moodForSessionEnd({ correct: 9, total: 12 })).toBe('cheer')
  })
  it('empty session → cheer (no division by zero)', () => {
    expect(moodForSessionEnd({ correct: 0, total: 0 })).toBe('cheer')
  })
})
