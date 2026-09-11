'use client'
import Link from 'next/link'
import { GoalRing } from '@/components/ui/goal-ring'
import { Card } from '@/components/ui/card'
import { Mascot, moodForHome } from '@/components/ui/mascot'
import { PwaInstallBanner } from '@/components/pwa-install-banner'
import { todayStats } from '@/lib/progress/store'
import { useProgress } from '@/lib/progress/use-progress'
import { TIMEZONE } from '@/lib/progress/config'

export function HomeClient() {
  // 進度只存在瀏覽器：useSyncExternalStore 讓 server 快照回傳 null、client 讀 localStorage，
  // 不需要在 effect 裡 setState 就能避開 hydration 不一致。
  const p = useProgress()

  const done = p ? todayStats(p, new Date(), TIMEZONE).reviews : 0
  const goal = p?.dailyGoal ?? 20
  const streak = p?.streak ?? 0
  const longest = p?.longestStreak ?? 0
  const mastered = p?.mastered.length ?? 0

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col items-center gap-6 px-4 py-8">
      <Mascot mood={moodForHome({ goalMet: done >= goal, streak, longestStreak: longest })} size={120} />
      <h1 className="text-xl font-extrabold text-neutral-900">今天也來背幾個字吧</h1>

      <PwaInstallBanner />

      <Card className="flex w-full flex-col items-center gap-3 p-6">
        <GoalRing done={done} goal={goal} />
        <p className="text-sm font-semibold text-neutral-600">今日目標進度</p>
      </Card>

      <div className="grid w-full grid-cols-2 gap-3">
        <Card className="flex flex-col items-center gap-1 p-5">
          <div className="text-2xl font-extrabold text-primary-600">🔥 {streak} 天</div>
          <div className="text-xs font-semibold text-neutral-600">連續學習（最長 {longest}）</div>
        </Card>
        <Card className="flex flex-col items-center gap-1 p-5">
          <div className="text-2xl font-extrabold text-mastery">{mastered}</div>
          <div className="text-xs font-semibold text-neutral-600">已精熟單字</div>
        </Card>
      </div>

      <Link
        href="/learn/all"
        className="inline-flex min-h-11 w-full items-center justify-center rounded-control bg-primary-500 px-5 py-4 text-lg font-extrabold text-white shadow-[0_6px_14px_rgba(255,106,61,.35)] transition hover:bg-primary-600"
      >
        開始今日複習
      </Link>

      <Link href="/books" className="text-sm font-bold text-primary-600 hover:underline">選擇單字書 📚</Link>
      <Link href="/stats" className="text-sm font-bold text-primary-600 hover:underline">學習數據與備份 📊</Link>
    </main>
  )
}
