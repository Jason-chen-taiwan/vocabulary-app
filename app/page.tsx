import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'
import { GamificationBar } from '@/components/gamification-bar'
import { GamificationRepository } from '@/lib/gamification/repository'
import { todayYmd } from '@/lib/gamification/date'
import { GoalRing } from '@/components/ui/goal-ring'
import { Card } from '@/components/ui/card'
import { SignOutButton } from '@/components/sign-out-button'
import { Mascot, moodForHome } from '@/components/ui/mascot'
import { ShopRepository, type Equipped } from '@/lib/shop/repository'
import { PwaInstallBanner } from '@/components/pwa-install-banner'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  let done = 0, goal = 20, streak = 0, longest = 0
  let equipped: Equipped = { head: null, face: null, neck: null }
  try {
    const { state, timezone, dailyGoal } = await new GamificationRepository().getContext(user.id)
    goal = dailyGoal
    if (state) {
      streak = state.streak
      longest = state.longestStreak
      // reviewsToday 只在「今天」才算數（懶評估尚未跨日重置時避免顯示昨天的數）
      done = state.lastReviewDate === todayYmd(new Date(), timezone) ? state.reviewsToday : 0
    }
    equipped = await new ShopRepository().getEquipped(user.id)
  } catch { /* 用預設值，不阻斷頁面 */ }

  return (
    <>
      <GamificationBar />
      <main className="mx-auto flex w-full max-w-2xl flex-col items-center gap-6 px-4 py-8">
        <Mascot mood={moodForHome({ goalMet: done >= goal, streak, longestStreak: longest })} size={120} equipped={equipped} />
        <h1 className="text-xl font-extrabold text-neutral-900">歡迎，{user.name ?? user.email}</h1>

        <PwaInstallBanner />

        <Card className="flex w-full flex-col items-center gap-3 p-6">
          <GoalRing done={done} goal={goal} />
          <p className="text-sm font-semibold text-neutral-600">今日目標進度</p>
        </Card>

        <Card className="flex w-full items-center justify-between p-5">
          <div>
            <div className="text-2xl font-extrabold text-primary-600">🔥 {streak} 天</div>
            <div className="text-xs font-semibold text-neutral-600">最長 {longest} 天</div>
          </div>
          <span className="text-sm font-semibold text-neutral-600">連續達標</span>
        </Card>

        <Link
          href="/books"
          className="inline-flex min-h-11 w-full items-center justify-center rounded-control bg-primary-500 px-5 py-4 text-lg font-extrabold text-white shadow-[0_6px_14px_rgba(255,106,61,.35)] transition hover:bg-primary-600"
        >
          開始學單字
        </Link>

        <Link href="/leaderboard" className="text-sm font-bold text-primary-600 hover:underline">查看排行榜 🏆</Link>
        <Link href="/shop" className="text-sm font-bold text-primary-600 hover:underline">前往商店 🛍️</Link>
        <Link href="/stats" className="text-sm font-bold text-primary-600 hover:underline">學習數據 📊</Link>

        <SignOutButton />
      </main>
    </>
  )
}
