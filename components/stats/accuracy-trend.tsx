import type { DayAccuracy } from '@/lib/stats/aggregate'

// 折線圖：每個有複習的日一個點，連線 + 面積填充。資料少時（1~3 點）也讀得出趨勢。
export function AccuracyTrend({ daily }: { daily: DayAccuracy[] }) {
  if (daily.length === 0) {
    return <p className="py-6 text-center text-sm text-neutral-600">近 30 天還沒有複習紀錄。</p>
  }
  const W = 300, H = 96, padX = 12, padY = 10
  const pts = daily.map((d, i) => {
    const pct = (d.correct / d.total) * 100
    const x = daily.length === 1 ? W / 2 : padX + (i / (daily.length - 1)) * (W - 2 * padX)
    const y = padY + (1 - pct / 100) * (H - 2 * padY)
    return { x, y, pct: Math.round(pct), day: d.day }
  })
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const last = pts[pts.length - 1], first = pts[0]
  const area = `${line} L${last.x.toFixed(1)},${H - padY} L${first.x.toFixed(1)},${H - padY} Z`

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="正確率趨勢">
      {[0, 50, 100].map((g) => {
        const y = padY + (1 - g / 100) * (H - 2 * padY)
        return <line key={g} x1={padX} y1={y} x2={W - padX} y2={y} stroke="var(--color-neutral-100)" strokeWidth="1" />
      })}
      <path d={area} fill="var(--color-primary-100)" opacity="0.7" />
      <path d={line} fill="none" stroke="var(--color-primary-500)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p) => (
        <circle key={p.day} cx={p.x} cy={p.y} r="3.5" fill="#fff" stroke="var(--color-primary-500)" strokeWidth="2.5">
          <title>{`${p.day}：${p.pct}%`}</title>
        </circle>
      ))}
    </svg>
  )
}
