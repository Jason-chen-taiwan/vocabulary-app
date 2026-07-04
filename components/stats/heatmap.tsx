import type { HeatCell } from '@/lib/stats/aggregate'

// 空白日用灰色、有複習用橘色階，讓「沒複習 vs 有複習」對比清楚。
const LEVEL_BG: Record<number, string> = {
  0: 'bg-neutral-100',
  1: 'bg-primary-100',
  2: 'bg-primary-300',
  3: 'bg-primary-500',
}

// cells 為 oldest→today、長度 weeks*7。以 7 列縱向排、逐週成欄。
export function Heatmap({ cells }: { cells: HeatCell[] }) {
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <div className="grid grid-flow-col gap-[3px]" style={{ gridTemplateRows: 'repeat(7, minmax(0, 1fr))' }}>
          {cells.map((c) => (
            <div
              key={c.day}
              title={`${c.day}：${c.count} 次`}
              className={`h-3.5 w-3.5 rounded-[4px] ${LEVEL_BG[c.level]}`}
            />
          ))}
        </div>
      </div>
      <div className="flex items-center justify-end gap-1.5 text-xs text-neutral-600">
        <span>少</span>
        {[0, 1, 2, 3].map((l) => (
          <span key={l} className={`h-3 w-3 rounded-[3px] ${LEVEL_BG[l]}`} />
        ))}
        <span>多</span>
      </div>
    </div>
  )
}
