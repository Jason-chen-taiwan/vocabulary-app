import { describe, it, expect } from 'vitest'
import { FsrsScheduler } from '@/lib/learning/scheduler'

const now = new Date('2026-06-27T00:00:00Z')

describe('FsrsScheduler', () => {
  it('newCard starts in the New state, reps 0, due at now', () => {
    const s = new FsrsScheduler()
    const c = s.newCard(now)
    expect(c.state).toBe(0)
    expect(c.reps).toBe(0)
    expect(c.due.getTime()).toBe(now.getTime())
    expect(c.lastReview).toBeNull()
  })

  it('review with "good" advances reps and schedules due in the future', () => {
    const s = new FsrsScheduler()
    const next = s.review(s.newCard(now), 'good', now)
    expect(next.reps).toBe(1)
    expect(next.due.getTime()).toBeGreaterThan(now.getTime())
    expect(next.lastReview?.getTime()).toBe(now.getTime())
    expect(next.state).toBeGreaterThan(0) // left New
  })

  it('review with "again" keeps the card due very soon (shorter than "good")', () => {
    const s = new FsrsScheduler()
    const card = s.newCard(now)
    const again = s.review(card, 'again', now)
    const good = s.review(card, 'good', now)
    expect(again.due.getTime()).toBeLessThan(good.due.getTime())
    expect(again.lapses).toBeGreaterThanOrEqual(0)
  })

  it('is deterministic (fuzz disabled): same input → same due', () => {
    const s = new FsrsScheduler()
    const card = s.newCard(now)
    expect(s.review(card, 'good', now).due.getTime()).toBe(s.review(card, 'good', now).due.getTime())
  })
})
