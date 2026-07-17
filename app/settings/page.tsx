import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getCurrentUser } from '@/lib/auth/session'
import { UserSettingsRepository } from '@/lib/user/settings'
import { SettingsForm } from './form'
import { ReminderForm } from './reminder-form'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const s = await new UserSettingsRepository().get(user.id)
  const r = await new UserSettingsRepository().getReminder(user.id)

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-8">
      <Link
        href="/"
        className="text-sm font-semibold text-neutral-600 hover:text-neutral-900"
      >
        ← 首頁
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-extrabold text-neutral-900">設定</h1>
      <SettingsForm
        initialName={s.displayName ?? s.name ?? ''}
        initialOptIn={s.leaderboardOptIn}
      />
      <ReminderForm initialEnabled={r.reminderEnabled} initialHour={r.reminderHour} />
    </main>
  )
}
