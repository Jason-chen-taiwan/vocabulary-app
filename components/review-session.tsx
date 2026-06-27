'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { TtsButton } from '@/components/tts-button'
import type { WordWithExamples } from '@/lib/content/types'
import type { ReviewMode, Rating } from '@/lib/learning/types'
import { submitReviewAction, finishSessionAction } from '@/app/learn/[slug]/actions'

export interface ReviewCard {
  mode: ReviewMode
  isNew: boolean
  word: WordWithExamples
}

const RATINGS: { rating: Rating; label: string; className: string }[] = [
  { rating: 'again', label: '忘記', className: 'bg-red-600' },
  { rating: 'hard', label: '困難', className: 'bg-orange-600' },
  { rating: 'good', label: '良好', className: 'bg-green-600' },
  { rating: 'easy', label: '簡單', className: 'bg-blue-600' },
]

export function ReviewSession({ bookName, bookSlug, cards }: { bookName: string; bookSlug: string; cards: ReviewCard[] }) {
  const router = useRouter()
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  const card = cards[index]

  async function grade(rating: Rating) {
    if (busy) return
    setBusy(true)
    const result = await submitReviewAction(card.word.id, rating)
    if (!result.ok) {
      console.error('複習送出失敗，請重新整理頁面')
      setBusy(false)
      return
    }
    if (index + 1 >= cards.length) {
      await finishSessionAction(cards.length)
      setDone(true)
    } else {
      setIndex(index + 1)
      setRevealed(false)
      setBusy(false)
    }
  }

  if (done) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">完成！</h1>
        <p className="mt-4 text-gray-400">本次複習了 {cards.length} 個單字。</p>
        <div className="mt-6 flex justify-center gap-4">
          <Link href={`/books/${bookSlug}`} className="text-sm text-gray-400 hover:underline">← 回單字書</Link>
          <button onClick={() => router.refresh()} className="text-sm text-blue-400 hover:underline">再來一輪</button>
        </div>
      </main>
    )
  }

  // Front face depends on mode: recognition shows English; recall shows Chinese; listening shows only audio.
  const showEnglishFront = card.mode === 'recognition'
  const showChineseFront = card.mode === 'recall'
  const showAudioFront = card.mode === 'listening'

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col px-4 py-8">
      <div className="mb-4 flex items-center justify-between text-sm text-gray-500">
        <Link href={`/books/${bookSlug}`} className="hover:underline">← {bookName}</Link>
        <span>{index + 1} / {cards.length}</span>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        {card.isNew && <span className="rounded-full bg-yellow-600 px-2 py-0.5 text-xs">新字</span>}

        {showEnglishFront && <div className="text-4xl font-bold">{card.word.headword}</div>}
        {showChineseFront && <div className="text-2xl">{card.word.definitionZh}</div>}
        {showAudioFront && (
          <div className="flex flex-col items-center gap-2">
            <span className="text-gray-500">聽發音，回想這個字</span>
            <TtsButton text={card.word.headword} />
          </div>
        )}

        {revealed && (
          <div className="mt-2 border-t border-gray-700 pt-4">
            <div className="flex items-center justify-center gap-2 text-3xl font-bold">
              {card.word.headword}<TtsButton text={card.word.headword} />
            </div>
            {card.word.phonetic && <div className="text-gray-400">{card.word.phonetic}</div>}
            <div className="mt-1 text-xl">{card.word.definitionZh}</div>
            {card.word.examples[0] && (
              <div className="mt-3 text-sm text-gray-400">
                <p>{card.word.examples[0].sentence}</p>
                <p>{card.word.examples[0].translationZh}</p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-6">
        {!revealed ? (
          <button onClick={() => setRevealed(true)} className="w-full rounded-lg bg-white py-3 font-medium text-black">
            顯示答案
          </button>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {RATINGS.map((r) => (
              <button key={r.rating} disabled={busy} onClick={() => grade(r.rating)}
                className={`${r.className} rounded-lg py-3 text-sm font-medium text-white disabled:opacity-50`}>
                {r.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
