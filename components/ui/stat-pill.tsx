import type { ReactNode } from 'react'

export function StatPill({ icon, value, label }: { icon: string; value: ReactNode; label?: string }) {
  return (
    <span
      title={label}
      className="inline-flex items-center gap-1 rounded-pill bg-primary-100 px-3 py-1 text-sm font-extrabold text-primary-600"
    >
      <span aria-hidden>{icon}</span>
      <span>{value}</span>
    </span>
  )
}
