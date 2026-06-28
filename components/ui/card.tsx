import Link from 'next/link'
import type { ReactNode } from 'react'

export function Card({ className = '', children }: { className?: string; children: ReactNode }) {
  return <div className={`rounded-card bg-surface shadow-[0_12px_30px_rgba(255,106,61,.10)] ${className}`}>{children}</div>
}

export function CardLink({ href, className = '', children }: { href: string; className?: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className={`block rounded-card bg-surface shadow-[0_12px_30px_rgba(255,106,61,.10)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_36px_rgba(255,106,61,.18)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500 ${className}`}
    >
      {children}
    </Link>
  )
}
