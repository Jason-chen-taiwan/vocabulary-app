import type { DueBucket } from '@/lib/stats/aggregate'
import { clampPct } from '@/components/ui/progress-bar'

const WEEKDAY = ['日', '一', '二', '三', '四', '五', '六']
function weekdayLabel(ymd: string): string {
  return WEEKDAY[new Date(`${ymd}T00:00:00Z`).getUTCDay()]
}

// 三列對齊：數字 / 從基準線長出的細長條 / 星期。空的日子只留數字，不留大灰塊。
export function DueBars({ buckets }: { buckets: DueBucket[] }) {
  const max = Math.max(1, ...buckets.map((b) => b.count))
  return (
    <div className="space-y-1">
      <div className="flex gap-2">
        {buckets.map((b, i) => (
          <span key={b.day} className={`flex-1 text-center text-xs font-bold ${i === 0 ? 'text-primary-600' : 'text-neutral-900'}`}>{b.count}</span>
        ))}
      </div>
      <div className="flex h-24 items-end gap-2 border-b-2 border-neutral-100">
        {buckets.map((b, i) => (
          <div key={b.day} className="flex h-full flex-1 items-end justify-center" title={`${b.day}：${b.count} 張`}>
            <div className={`w-7 max-w-full rounded-t-[5px] ${i === 0 ? 'bg-primary-500' : 'bg-primary-300'}`} style={{ height: `${clampPct(b.count, max)}%` }} />
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        {buckets.map((b, i) => (
          <span key={b.day} className={`flex-1 text-center text-xs ${i === 0 ? 'font-bold text-primary-600' : 'text-neutral-600'}`}>{i === 0 ? '今天' : weekdayLabel(b.day)}</span>
        ))}
      </div>
    </div>
  )
}
