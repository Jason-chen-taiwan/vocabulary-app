export function ringGeometry(done: number, goal: number, radius: number): { circumference: number; offset: number } {
  const circumference = 2 * Math.PI * radius
  const pct = goal <= 0 ? 0 : Math.max(0, Math.min(1, done / goal))
  return { circumference, offset: circumference * (1 - pct) }
}

export function GoalRing({ done, goal }: { done: number; goal: number }) {
  const radius = 52
  const { circumference, offset } = ringGeometry(done, goal, radius)
  const reached = goal > 0 && done >= goal
  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width="128" height="128" viewBox="0 0 128 128" className="-rotate-90">
        <circle cx="64" cy="64" r={radius} fill="none" stroke="var(--color-primary-100)" strokeWidth="12" />
        <circle
          cx="64" cy="64" r={radius} fill="none" stroke="var(--color-primary-500)" strokeWidth="12"
          strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-700"
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-2xl font-extrabold text-neutral-900">{reached ? '✓' : done}</span>
        <span className="text-xs font-bold text-neutral-600">/ {goal} 今日</span>
      </div>
    </div>
  )
}
