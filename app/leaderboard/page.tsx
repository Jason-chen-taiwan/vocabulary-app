import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getCurrentUser } from '@/lib/auth/session'
import { leaderboardService } from '@/lib/leaderboard/service'
import { GamificationBar } from '@/components/gamification-bar'
import { LeaderboardTabs } from './tabs'

export const dynamic = 'force-dynamic'

export default async function LeaderboardPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const now = new Date()
  const tz = 'Asia/Taipei'
  const [weekly, allTime] = await Promise.all([
    leaderboardService.getBoard(user.id, 'weekly', now, tz),
    leaderboardService.getBoard(user.id, 'allTime', now, tz),
  ])
  return (
    <>
      <GamificationBar />
      <main className="mx-auto w-full max-w-xl px-4 py-8">
        <h1 className="mb-4 text-2xl font-extrabold text-neutral-900">排行榜</h1>
        {!weekly.optedIn && (
          <p className="mb-4 rounded-control bg-primary-50 p-3 text-sm text-neutral-600">
            你尚未加入排行榜。到 <Link href="/settings" className="font-bold text-primary-600 hover:underline">設定</Link> 開啟即可上榜。
          </p>
        )}
        <LeaderboardTabs weekly={weekly} allTime={allTime} />
      </main>
    </>
  )
}
