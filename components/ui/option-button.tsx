'use client'
import type { ReactNode } from 'react'

export type OptionState = 'idle' | 'correct' | 'wrong' | 'dimmed'

export const OPTION_STATE: Record<OptionState, string> = {
  idle: 'border-primary-100 bg-surface text-neutral-900 hover:border-primary-300',
  correct: 'border-success bg-[#E9F7F0] text-success',
  wrong: 'border-error bg-[#FDECEC] text-error',
  dimmed: 'border-neutral-200 bg-surface text-neutral-600 opacity-60',
}

export function OptionButton({
  state, disabled, onClick, children,
}: { state: OptionState; disabled?: boolean; onClick?: () => void; children: ReactNode }) {
  return (
    <button
      type="button" disabled={disabled} onClick={onClick}
      className={`w-full rounded-control border-2 px-4 py-3 text-left font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 ${OPTION_STATE[state]}`}
    >
      {children}
    </button>
  )
}
