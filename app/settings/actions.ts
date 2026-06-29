'use server'

import { getCurrentUser } from '@/lib/auth/session'
import { UserSettingsRepository } from '@/lib/user/settings'

export async function updateSettingsAction(
  displayName: string,
  leaderboardOptIn: boolean
): Promise<{ ok: boolean }> {
  const user = await getCurrentUser()
  if (!user) return { ok: false }

  const trimmed = displayName.trim().slice(0, 20)
  await new UserSettingsRepository().update(user.id, {
    displayName: trimmed || null,
    leaderboardOptIn,
  })

  return { ok: true }
}
