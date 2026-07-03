import type { StateCounts } from '@/lib/stats/aggregate'

const SEGMENTS: { key: keyof StateCounts; label: string; bg: string }[] = [
  { key: 'mastered', label: '精熟', bg: 'bg-primary-600' },
  { key: 'review', label: '複習中', bg: 'bg-primary-500' },
  { key: 'learning', label: '學習中', bg: 'bg-primary-300' },
  { key: 'newCount', label: '未開始', bg: 'bg-neutral-200' },
]

export function StateDistribution({ states, totalWords }: { states: StateCounts; totalWords: number }) {
  const denom = Math.max(1, totalWords)
  return (
    <div className="space-y-2">
      <div className="flex h-4 w-full overflow-hidden rounded-pill">
        {SEGMENTS.map((s) => {
          const v = states[s.key]
          if (v <= 0) return null
          return <div key={s.key} className={s.bg} style={{ width: `${(v / denom) * 100}%` }} title={`${s.label}：${v}`} />
        })}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-600">
        {SEGMENTS.map((s) => (
          <span key={s.key} className="flex items-center gap-1">
            <span className={`h-2 w-2 rounded-full ${s.bg}`} />{s.label} {states[s.key]}
          </span>
        ))}
      </div>
    </div>
  )
}
