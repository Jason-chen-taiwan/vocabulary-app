import { describe, it, expect, vi } from 'vitest'
import { tzOffsetHours, selectDueUsers, runReminders } from '../reminders'

describe('tzOffsetHours', () => {
  it('returns 8 for Asia/Taipei', () => {
    const ms = Date.UTC(2026, 6, 17, 0, 0)
    expect(tzOffsetHours('Asia/Taipei', ms)).toBe(8)
  })
})

const taipeiUser = {
  userId: 'u1',
  timezone: 'Asia/Taipei',
  reminderHour: 20,
  lastGoalDate: null as string | null,
  subscriptions: [{ endpoint: 'e', p256dh: 'k', auth: 'a' }],
}

describe('selectDueUsers', () => {
  // Taipei 20:00 local == 12:00 UTC. Pick 2026-07-17T12:00Z.
  const nowMs = Date.UTC(2026, 6, 17, 12, 0)

  it('includes a user whose local hour matches and who has not hit goal today', () => {
    const due = selectDueUsers([taipeiUser], 12, nowMs)
    expect(due.map((u) => u.userId)).toEqual(['u1'])
  })

  it('excludes a user at the wrong local hour', () => {
    const due = selectDueUsers([taipeiUser], 13, nowMs)
    expect(due).toEqual([])
  })

  it('excludes a user who already hit today\'s goal (local date)', () => {
    const already = { ...taipeiUser, lastGoalDate: '2026-07-17' }
    const due = selectDueUsers([already], 12, nowMs)
    expect(due).toEqual([])
  })
})

describe('runReminders', () => {
  const nowMs = Date.UTC(2026, 6, 17, 12, 0)
  function deps(overrides = {}) {
    return {
      listDue: vi.fn(async () => [taipeiUser]),
      lockGet: vi.fn(async () => null),
      lockSet: vi.fn(async () => {}),
      send: vi.fn(async () => ({ status: 201 })),
      prune: vi.fn(async () => {}),
      nowUtcHour: 12,
      nowUtcMs: nowMs,
      ...overrides,
    }
  }

  it('sends one push and records the idempotency lock', async () => {
    const d = deps()
    const res = await runReminders(d as never)
    expect(d.send).toHaveBeenCalledTimes(1)
    expect(d.lockSet).toHaveBeenCalledWith('u1-2026-07-17')
    expect(res.sent).toBe(1)
  })

  it('skips a user already locked today', async () => {
    const d = deps({ lockGet: vi.fn(async () => '1') })
    const res = await runReminders(d as never)
    expect(d.send).not.toHaveBeenCalled()
    expect(res.sent).toBe(0)
  })

  it('prunes a subscription that returns 410 Gone', async () => {
    const d = deps({ send: vi.fn(async () => ({ status: 410 })) })
    await runReminders(d as never)
    expect(d.prune).toHaveBeenCalledWith('e')
  })
})
