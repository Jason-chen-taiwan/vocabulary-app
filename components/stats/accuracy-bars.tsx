import type { DayAccuracy } from '@/lib/stats/aggregate'

// 只畫有複習的日；高度＝該日答對率 %。空資料顯示提示。
export function AccuracyBars({ daily }: { daily: DayAccuracy[] }) {
  if (daily.length === 0) {
    return <p className="py-6 text-center text-sm text-neutral-600">近 30 天還沒有複習紀錄。</p>
  }
  return (
    <div className="flex h-32 items-end gap-1 overflow-x-auto">
      {daily.map((d) => {
        const pct = Math.round((d.correct / d.total) * 100)
        return (
          <div key={d.day} className="flex min-w-[8px] flex-1 flex-col items-center gap-1" title={`${d.day}：${d.correct}/${d.total}（${pct}%）`}>
            <div className="flex h-full w-full items-end">
              <div className="w-full rounded-t-[3px] bg-primary-500" style={{ height: `${pct}%` }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
