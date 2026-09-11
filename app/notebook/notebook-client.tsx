'use client'
import Link from 'next/link'
import { TtsButton } from '@/components/tts-button'
import { useProgress } from '@/lib/progress/use-progress'
import { listNotebook } from '@/lib/progress/reading'

export function NotebookClient() {
  const p = useProgress()
  const words = p ? listNotebook(p) : []

  if (words.length === 0) {
    return (
      <p className="mt-6 text-neutral-600">
        還沒有收集任何生字。到<Link href="/read" className="font-bold text-primary-600 hover:underline">沉浸閱讀</Link>點文章裡的單字就能加進來。
      </p>
    )
  }

  return (
    <ul className="mt-4 divide-y divide-neutral-200 rounded-card border border-neutral-200 bg-surface">
      {words.map((w) => (
        <li key={w.lemma} className="flex items-baseline justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <span className="font-bold text-neutral-900">{w.lemma}</span>
            {w.pos && <span className="ml-2 text-xs text-neutral-500">{w.pos}</span>}
            <p className="text-sm text-neutral-600">{w.zh}</p>
          </div>
          <TtsButton text={w.lemma} />
        </li>
      ))}
    </ul>
  )
}
