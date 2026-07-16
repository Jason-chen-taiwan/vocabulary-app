import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getCurrentUser } from '@/lib/auth/session'
import { statsService } from '@/lib/stats/service'
import { GamificationBar } from '@/components/gamification-bar'
import { Card } from '@/components/ui/card'
import { Heatmap } from '@/components/stats/heatmap'
import { AccuracyTrend } from '@/components/stats/accuracy-trend'
import { DueBars } from '@/components/stats/due-bars'
import { StateDistribution } from '@/components/stats/state-distribution'
import { BookProgress } from '@/components/stats/book-progress'
import { GamificationRepository } from '@/lib/gamification/repository'
import { todayYmd } from '@/lib/gamification/date'
import { ShareButton } from '@/components/share-card/share-button'
import type { ShareCardStats } from '@/components/share-card/card-data'

export default async function StatsPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const tz = 'Asia/Taipei'
  const d = await statsService.getDashboard(user.id, new Date(), tz)

  // 分享卡資料：全部是後端已算好的權威數字，前端只畫圖。
  let share: ShareCardStats = { streak: 0, level: 1, badgeCount: 0, goalMet: false, dateLabel: '' }
  try {
    const repo = new GamificationRepository()
    const [{ state, timezone, dailyGoal }, badgeKeys] = await Promise.all([
      repo.getContext(user.id),
      repo.listBadgeKeys(user.id),
    ])
    const today = todayYmd(new Date(), timezone)
    share = {
      streak: state?.streak ?? 0,
      level: state?.level ?? 1,
      badgeCount: badgeKeys.length,
      goalMet: state ? state.lastReviewDate === today && state.reviewsToday >= dailyGoal : false,
      dateLabel: new Intl.DateTimeFormat('zh-TW', { dateStyle: 'long', timeZone: timezone }).format(new Date()),
    }
  } catch { /* 分享卡用預設值，不阻斷頁面 */ }

  return (
    <>
      <GamificationBar />
      <main className="mx-auto w-full max-w-xl px-4 py-8">
        <Link href="/" className="text-sm font-semibold text-neutral-600 hover:text-neutral-900">← 首頁</Link>
        <h1 className="mt-2 mb-6 text-2xl font-extrabold text-neutral-900">學習數據</h1>

        <div className="space-y-6">
          <Card className="space-y-4 p-5">
            <h2 className="text-base font-extrabold text-neutral-900">📚 學習進度</h2>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-control bg-primary-50 px-3 py-3 text-center">
                <div className="text-2xl font-extrabold text-mastery">{d.progress.states.mastered}</div>
                <div className="text-xs font-semibold text-neutral-600">已精熟</div>
              </div>
              <div className="rounded-control bg-primary-50 px-3 py-3 text-center">
                <div className="text-2xl font-extrabold text-primary-600">{d.progress.states.startedTotal}</div>
                <div className="text-xs font-semibold text-neutral-600">已開始</div>
              </div>
              <div className="rounded-control bg-primary-50 px-3 py-3 text-center">
                <div className="text-2xl font-extrabold text-neutral-900">{d.progress.totalWords}</div>
                <div className="text-xs font-semibold text-neutral-600">總字數</div>
              </div>
            </div>
            <StateDistribution states={d.progress.states} totalWords={d.progress.totalWords} />
            <div className="space-y-3 pt-1">
              {d.progress.byBook.map((b) => (
                <BookProgress key={b.slug} book={b} />
              ))}
            </div>
          </Card>

          <Card className="space-y-3 p-5">
            <div className="flex items-baseline justify-between">
              <h2 className="text-base font-extrabold text-neutral-900">🔥 活躍紀錄</h2>
              <span className="text-xs font-bold text-primary-600">{d.activity.streak} 天（最長 {d.activity.longestStreak}）</span>
            </div>
            <p className="text-xs text-neutral-600">近 12 週每日複習量，格子越深表示當天複習越多。</p>
            <Heatmap cells={d.activity.cells} />
          </Card>

          <Card className="space-y-3 p-5">
            <div className="flex items-baseline justify-between">
              <h2 className="text-base font-extrabold text-neutral-900">🎯 正確率趨勢</h2>
              <span className="text-xs font-bold text-primary-600">近 {d.accuracy.window} 天 {d.accuracy.overallPct}%</span>
            </div>
            <p className="text-xs text-neutral-600">每個點 = 有複習的那天的答對率。</p>
            <AccuracyTrend daily={d.accuracy.daily} />
          </Card>

          <Card className="space-y-3 p-5">
            <h2 className="text-base font-extrabold text-neutral-900">📅 到期預報（7 天）</h2>
            <p className="text-xs text-neutral-600">未來 7 天每天有幾張卡「到期該複習」（今天含逾期）。</p>
            <DueBars buckets={d.dueForecast} />
          </Card>

          <Card className="space-y-3 p-5">
            <h2 className="text-base font-extrabold text-neutral-900">📤 分享成果</h2>
            <p className="text-xs text-neutral-600">產生一張成績圖卡，分享到 LINE / IG / FB。</p>
            <ShareButton stats={share} />
          </Card>
        </div>
      </main>
    </>
  )
}
