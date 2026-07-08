'use client'
import { useMemo, useRef, useState, useEffect } from 'react'

// Per-letter input for fill-in questions. The answer's shape drives the boxes:
// letters become editable slots, the first letter is prefilled and locked, and
// non-letters (space, hyphen) render as fixed separators. Word length = slot
// count, so the learner sees exactly how many letters remain.
//
// ponytail: answer is already sent to the client for local grading, so deriving
// the mask here leaks nothing new.

interface Slot {
  kind: 'letter' | 'sep'
  char: string // for sep: the literal; for letter: prefilled first char or ''
  locked: boolean
}

function buildSlots(answer: string): Slot[] {
  const chars = [...answer]
  return chars.map((c, i) => {
    if (!/[a-zA-Z]/.test(c)) return { kind: 'sep', char: c, locked: true }
    if (i === 0) return { kind: 'letter', char: c, locked: true }
    return { kind: 'letter', char: '', locked: false }
  })
}

export function LetterBoxes({
  answer,
  disabled,
  onComplete,
}: {
  answer: string
  disabled: boolean
  onComplete: (value: string) => void
}) {
  const slots = useMemo(() => buildSlots(answer), [answer])
  // editable letter slot indices (excludes locked first letter + separators)
  const editable = useMemo(() => slots.map((s, i) => ({ s, i })).filter((x) => x.s.kind === 'letter' && !x.s.locked).map((x) => x.i), [slots])

  const [values, setValues] = useState<Record<number, string>>({})
  const refs = useRef<Record<number, HTMLInputElement | null>>({})

  // reset when the word changes
  useEffect(() => {
    setValues({})
    const first = editable[0]
    if (first !== undefined) refs.current[first]?.focus()
  }, [answer, editable])

  function assemble(next: Record<number, string>): string {
    return slots
      .map((s, i) => (s.kind === 'sep' ? s.char : s.locked ? s.char : next[i] ?? ''))
      .join('')
  }

  function submitIfFull(next: Record<number, string>) {
    if (editable.every((i) => (next[i] ?? '').length === 1)) {
      onComplete(assemble(next))
    }
  }

  function setAt(i: number, ch: string) {
    const next = { ...values, [i]: ch }
    setValues(next)
    return next
  }

  function focusNext(i: number) {
    const pos = editable.indexOf(i)
    const nxt = editable[pos + 1]
    if (nxt !== undefined) refs.current[nxt]?.focus()
  }
  function focusPrev(i: number) {
    const pos = editable.indexOf(i)
    const prv = editable[pos - 1]
    if (prv !== undefined) refs.current[prv]?.focus()
  }

  function onChange(i: number, raw: string) {
    const ch = raw.replace(/[^a-zA-Z]/g, '').slice(-1).toLowerCase()
    if (!ch) return
    const next = setAt(i, ch)
    focusNext(i)
    submitIfFull(next)
  }

  function onKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      if (values[i]) {
        setAt(i, '')
      } else {
        focusPrev(i)
        e.preventDefault()
      }
    } else if (e.key === 'Enter') {
      submitIfFull(values)
    } else if (e.key === 'ArrowLeft') {
      focusPrev(i); e.preventDefault()
    } else if (e.key === 'ArrowRight') {
      focusNext(i); e.preventDefault()
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5">
      {slots.map((s, i) =>
        s.kind === 'sep' ? (
          <span key={i} className="px-1 text-2xl text-neutral-400">{s.char === ' ' ? ' ' : s.char}</span>
        ) : (
          <input
            key={i}
            ref={(el) => { refs.current[i] = el }}
            value={s.locked ? s.char : values[i] ?? ''}
            onChange={(e) => onChange(i, e.target.value)}
            onKeyDown={(e) => onKeyDown(i, e)}
            disabled={disabled || s.locked}
            maxLength={1}
            inputMode="text"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            aria-label={`第 ${i + 1} 個字母`}
            className={`h-12 w-9 rounded-control border-2 text-center text-xl font-bold uppercase focus:outline-none ${
              s.locked
                ? 'border-primary-200 bg-primary-50 text-primary-700'
                : 'border-primary-200 bg-surface text-neutral-900 focus:border-primary-500'
            }`}
          />
        ),
      )}
    </div>
  )
}
