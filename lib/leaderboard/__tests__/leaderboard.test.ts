import { describe, it, expect, vi } from 'vitest'
import { rankFromCountAbove, displayNameOf } from '@/lib/leaderboard/rank'
import { LeaderboardService } from '@/lib/leaderboard/service'

describe('rank helpers', () => {
  it('rank = countAbove + 1', () => { expect(rankFromCountAbove(0)).toBe(1); expect(rankFromCountAbove(7)).toBe(8) })
  it('displayNameOf prefers displayName, then name, then 匿名', () => {
    expect(displayNameOf({ displayName: '阿翔', name: 'Chen' })).toBe('阿翔')
    expect(displayNameOf({ displayName: null, name: 'Chen' })).toBe('Chen')
    expect(displayNameOf({ displayName: null, name: null })).toBe('匿名')
  })
})

function repo(over: Partial<Record<string, any>> = {}) {
  return {
    topAllTime: vi.fn().mockResolvedValue([
      { userId: 'a', xp: 300, user: { displayName: 'A', name: null } },
      { userId: 'me', xp: 100, user: { displayName: null, name: 'Me' } },
    ]),
    topWeekly: vi.fn().mockResolvedValue([{ userId: 'me', weeklyXp: 50, user: { displayName: null, name: 'Me' } }]),
    countAboveAllTime: vi.fn().mockResolvedValue(1),
    countAboveWeekly: vi.fn().mockResolvedValue(0),
    getStanding: vi.fn().mockResolvedValue({ xp: 100, weeklyXp: 50, weekStartDate: '2026-06-29', optedIn: true }),
    ...over,
  }
}
const now = new Date('2026-06-29T02:00:00Z')

describe('getBoard allTime', () => {
  it('returns entries with ranks, isMe, myRank', async () => {
    const svc = new LeaderboardService(repo() as any)
    const b = await svc.getBoard('me', 'allTime', now, 'Asia/Taipei')
    expect(b.optedIn).toBe(true)
    expect(b.entries[0]).toEqual({ rank: 1, name: 'A', value: 300, isMe: false })
    expect(b.entries[1]).toEqual({ rank: 2, name: 'Me', value: 100, isMe: true })
    expect(b.myRank).toBe(2) // countAboveAllTime 1 → rank 2
  })
})

describe('getBoard weekly', () => {
  it('uses weekly metric and current week', async () => {
    const r = repo()
    const svc = new LeaderboardService(r as any)
    const b = await svc.getBoard('me', 'weekly', now, 'Asia/Taipei')
    expect(r.topWeekly).toHaveBeenCalledWith(50, '2026-06-29')
    expect(b.entries[0]).toEqual({ rank: 1, name: 'Me', value: 50, isMe: true })
    expect(b.myRank).toBe(1)
  })
  it('myRank uses weekly=0 when standing is from a previous week', async () => {
    const r = repo({ getStanding: vi.fn().mockResolvedValue({ xp: 100, weeklyXp: 999, weekStartDate: '2026-06-22', optedIn: true }), countAboveWeekly: vi.fn().mockResolvedValue(3) })
    const svc = new LeaderboardService(r as any)
    const b = await svc.getBoard('me', 'weekly', now, 'Asia/Taipei')
    expect(r.countAboveWeekly).toHaveBeenCalledWith(0, '2026-06-29') // stale week → 0
    expect(b.myRank).toBe(4)
  })
})
