import { describe, it, expect, vi } from 'vitest'
import { UserSettingsRepository } from '../settings'

function db(row: unknown = null) {
  return {
    user: {
      findUnique: vi.fn(async () => row),
      update: vi.fn(async () => ({})),
    },
  } as never
}

describe('reminder settings', () => {
  it('getReminder returns defaults when row missing', async () => {
    const repo = new UserSettingsRepository(db(null))
    expect(await repo.getReminder('u1')).toEqual({ reminderEnabled: false, reminderHour: 20 })
  })

  it('getReminder returns stored prefs', async () => {
    const repo = new UserSettingsRepository(db({ reminderEnabled: true, reminderHour: 7 }))
    expect(await repo.getReminder('u1')).toEqual({ reminderEnabled: true, reminderHour: 7 })
  })

  it('updateReminder clamps hour to 0-23', async () => {
    const d = db()
    const repo = new UserSettingsRepository(d)
    await repo.updateReminder('u1', { reminderEnabled: true, reminderHour: 99 })
    const arg = (d as never as { user: { update: ReturnType<typeof vi.fn> } }).user.update.mock.calls[0][0]
    expect(arg.data.reminderHour).toBe(23)
    expect(arg.data.reminderEnabled).toBe(true)
  })
})
