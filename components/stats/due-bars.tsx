import type { DueBucket } from '@/lib/stats/aggregate'
import { clampPct } from '@/components/ui/progress-bar'

const WEEKDAY = ['日', '一', '二', '三', '四', '五', '六']
function weekdayLabel(ymd: string): string {
  return WEEKDAY[new Date(`${ymd}T00:00:00Z`).getUTCDay()]
}

// 長條放在固定高度(h-24)的軌道內，百分比高度才有可解析的父高度（否則會塌成 0）。今天醒目。
export function DueBars({ buckets }: { buckets: DueBucket[] }) {
  const max = Math.max(1, ...buckets.map((b) => b.count))
  return (
    <div className="flex items-end gap-2">
      {buckets.map((b, i) => {
        const today = i === 0
        return (
          <div key={b.day} className="flex flex-1 flex-col items-center gap-1" title={`${b.day}：${b.count} 張`}>
            <span className={`text-xs font-bold ${today ? 'text-primary-600' : 'text-neutral-900'}`}>{b.count}</span>
            <div className="flex h-24 w-full items-end overflow-hidden rounded-[4px] bg-neutral-100">
              <div className={`w-full rounded-[4px] ${today ? 'bg-primary-500' : 'bg-primary-300'}`} style={{ height: `${clampPct(b.count, max)}%` }} />
            </div>
            <span className={`text-xs ${today ? 'font-bold text-primary-600' : 'text-neutral-600'}`}>{today ? '今天' : weekdayLabel(b.day)}</span>
          </div>
        )
      })}
    </div>
  )
}
