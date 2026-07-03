import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getCurrentUser } from '@/lib/auth/session'
import { statsService } from '@/lib/stats/service'
import { GamificationBar } from '@/components/gamification-bar'
import { Card } from '@/components/ui/card'
import { ProgressBar } from '@/components/ui/progress-bar'
import { Heatmap } from '@/components/stats/heatmap'
import { AccuracyBars } from '@/components/stats/accuracy-bars'
import { DueBars } from '@/components/stats/due-bars'
import { StateDistribution } from '@/components/stats/state-distribution'

export default async function StatsPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const tz = 'Asia/Taipei'
  const d = await statsService.getDashboard(user.id, new Date(), tz)

  return (
    <>
      <GamificationBar />
      <main className="mx-auto w-full max-w-xl px-4 py-8">
        <Link href="/" className="text-sm font-semibold text-neutral-600 hover:text-neutral-900">← 首頁</Link>
        <h1 className="mt-2 mb-6 text-2xl font-extrabold text-neutral-900">學習數據</h1>

        <div className="space-y-6">
          <Card className="space-y-3 p-5">
            <h2 className="text-sm font-extrabold text-neutral-900">學習進度</h2>
            <div className="flex gap-6">
              <div><div className="text-2xl font-extrabold text-primary-600">{d.progress.states.mastered}</div><div className="text-xs text-neutral-600">已精熟</div></div>
              <div><div className="text-2xl font-extrabold text-neutral-900">{d.progress.states.startedTotal}</div><div className="text-xs text-neutral-600">已開始</div></div>
              <div><div className="text-2xl font-extrabold text-neutral-900">{d.progress.totalWords}</div><div className="text-xs text-neutral-600">總字數</div></div>
            </div>
            <StateDistribution states={d.progress.states} totalWords={d.progress.totalWords} />
            <div className="space-y-2 pt-2">
              {d.progress.byBook.map((b) => (
                <div key={b.slug} className="space-y-1">
                  <div className="flex justify-between text-xs font-semibold text-neutral-600"><span>{b.name}</span><span>{b.mastered}/{b.total}（{b.pct}%）</span></div>
                  <ProgressBar value={b.mastered} max={b.total} />
                </div>
              ))}
            </div>
          </Card>

          <Card className="space-y-3 p-5">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-extrabold text-neutral-900">活躍紀錄</h2>
              <span className="text-xs font-bold text-primary-600">🔥 {d.activity.streak} 天（最長 {d.activity.longestStreak}）</span>
            </div>
            <Heatmap cells={d.activity.cells} />
          </Card>

          <Card className="space-y-3 p-5">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-extrabold text-neutral-900">正確率趨勢</h2>
              <span className="text-xs font-bold text-primary-600">近 {d.accuracy.window} 天 {d.accuracy.overallPct}%</span>
            </div>
            <AccuracyBars daily={d.accuracy.daily} />
          </Card>

          <Card className="space-y-3 p-5">
            <h2 className="text-sm font-extrabold text-neutral-900">到期預報（7 天）</h2>
            <DueBars buckets={d.dueForecast} />
          </Card>
        </div>
      </main>
    </>
  )
}
