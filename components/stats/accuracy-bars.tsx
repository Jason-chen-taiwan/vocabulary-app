import type { DayAccuracy } from '@/lib/stats/aggregate'

// 只畫有複習的日；每根長條高度＝該日答對率 %。空資料顯示提示。
// 長條放在固定高度(h-24)的軌道內，百分比高度才有可解析的父高度（否則會塌成 0）。
export function AccuracyBars({ daily }: { daily: DayAccuracy[] }) {
  if (daily.length === 0) {
    return <p className="py-6 text-center text-sm text-neutral-600">近 30 天還沒有複習紀錄。</p>
  }
  return (
    <div className="flex items-end gap-1 overflow-x-auto">
      {daily.map((d) => {
        const pct = Math.round((d.correct / d.total) * 100)
        return (
          <div key={d.day} className="flex min-w-[10px] flex-1 flex-col items-center" title={`${d.day}：${d.correct}/${d.total}（${pct}%）`}>
            <div className="flex h-24 w-full items-end overflow-hidden rounded-[4px] bg-neutral-100">
              <div className="w-full rounded-[4px] bg-primary-500" style={{ height: `${Math.max(pct, 4)}%` }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
