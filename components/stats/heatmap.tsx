import type { HeatCell } from '@/lib/stats/aggregate'

const LEVEL_BG: Record<number, string> = {
  0: 'bg-primary-50',
  1: 'bg-primary-200',
  2: 'bg-primary-400',
  3: 'bg-primary-600',
}

// cells 為 oldest→today、長度 weeks*7。以 7 列（週日→週六無關，純視覺）縱向排、逐週成欄。
export function Heatmap({ cells }: { cells: HeatCell[] }) {
  return (
    <div className="overflow-x-auto">
      <div
        className="grid grid-flow-col gap-1"
        style={{ gridTemplateRows: 'repeat(7, minmax(0, 1fr))' }}
      >
        {cells.map((c) => (
          <div
            key={c.day}
            title={`${c.day}：${c.count} 次`}
            className={`h-3 w-3 rounded-[3px] ${LEVEL_BG[c.level]}`}
          />
        ))}
      </div>
    </div>
  )
}
