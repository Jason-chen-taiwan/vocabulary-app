export function clampPct(value: number, max: number): number {
  if (max <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((value / max) * 100)))
}

export function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = clampPct(value, max)
  return (
    <div className="h-2 w-full overflow-hidden rounded-pill bg-primary-100">
      <div className="h-full rounded-pill bg-primary-500 transition-[width] duration-500" style={{ width: `${pct}%` }} />
    </div>
  )
}
