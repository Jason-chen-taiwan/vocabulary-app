import type { ReactNode } from 'react'

export type CelebrateTone = 'reward' | 'coin' | 'mastery' | 'level'

export const CELEBRATE_TONE: Record<CelebrateTone, string> = {
  reward: 'bg-primary-500 text-white',
  coin: 'bg-coin text-ink',
  mastery: 'bg-mastery text-white',
  level: 'bg-success text-white',
}

export function CelebrateCard({ tone, children }: { tone: CelebrateTone; children: ReactNode }) {
  return (
    <div className={`animate-pop-in rounded-celebrate border-[3px] border-ink px-4 py-3 text-center font-extrabold shadow-[3px_3px_0_#1A1A1A] ${CELEBRATE_TONE[tone]}`}>
      {children}
    </div>
  )
}
