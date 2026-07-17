'use server'

import { getCurrentUser } from '@/lib/auth/session'
import { UserSettingsRepository } from '@/lib/user/settings'

export async function updateReminderAction(
  enabled: boolean,
  hour: number
): Promise<{ ok: boolean }> {
  const user = await getCurrentUser()
  if (!user) return { ok: false }
  await new UserSettingsRepository().updateReminder(user.id, {
    reminderEnabled: enabled,
    reminderHour: hour,
  })
  return { ok: true }
}
