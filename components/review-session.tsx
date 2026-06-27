'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { TtsButton } from '@/components/tts-button'
import { checkAnswer, sample, type Question } from '@/lib/learning/question'
import { submitAnswerAction, finishSessionAction } from '@/app/learn/[slug]/actions'

export interface ReviewItem {
  question: Question
  isSpotCheck: boolean
}

export function ReviewSession({ bookName, bookSlug, items }: { bookName: string; bookSlug: string; items: ReviewItem[] }) {
  const router = useRouter()
  const [index, setIndex] = useState(0)
  const [input, setInput] = useState('')
  const [picked, setPicked] = useState<string | null>(null)
  const [result, setResult] = useState<null | { correct: boolean }>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  const item = items[index]
  const q = item.question
  // shuffle MC options once per card
  const options = useMemo(() => (q.options ? sample(q.options, q.options.length) : null), [q])

  function evaluate(answer: string): boolean {
    return q.type === 'mc' ? answer === q.answer : checkAnswer(answer, q.answer)
  }

  async function commit(correct: boolean) {
    if (busy) return
    setBusy(true)
    setResult({ correct })
    try {
      await submitAnswerAction(q.wordId, correct)
    } catch {
      // even on error we let the user continue; progress for this card may not have saved
    }
    setBusy(false)
  }

  function onPick(opt: string) {
    if (result) return
    setPicked(opt)
    void commit(evaluate(opt))
  }

  function onSubmitText(e: React.FormEvent) {
    e.preventDefault()
    if (result || !input.trim()) return
    void commit(evaluate(input))
  }

  async function next() {
    if (index + 1 >= items.length) {
      try { await finishSessionAction(items.length) } catch { /* ignore */ }
      setDone(true)
      return
    }
    setIndex(index + 1)
    setInput(''); setPicked(null); setResult(null)
  }

  if (done) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">完成！</h1>
        <p className="mt-4 text-gray-400">本次複習了 {items.length} 個單字。</p>
        <div className="mt-6 flex justify-center gap-4">
          <Link href={`/books/${bookSlug}`} className="text-sm text-gray-400 hover:underline">← 回單字書</Link>
          <button onClick={() => router.refresh()} className="text-sm text-blue-400 hover:underline">再來一輪</button>
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col px-4 py-8">
      <div className="mb-6 flex items-center justify-between text-sm text-gray-500">
        <Link href={`/books/${bookSlug}`} className="hover:underline">← {bookName}</Link>
        <span>{index + 1} / {items.length}</span>
      </div>

      <div className="flex flex-1 flex-col items-center gap-4 text-center">
        {item.isSpotCheck && <span className="rounded-full bg-purple-700 px-2 py-0.5 text-xs">記憶抽考</span>}

        {/* prompt */}
        {q.type === 'mc' && (
          <div className="flex items-center gap-2">
            <span className="text-4xl font-bold">{q.prompt}</span>
            {q.audioText && <TtsButton text={q.audioText} />}
          </div>
        )}
        {q.type === 'cloze' && (
          <div className="space-y-2">
            <p className="text-2xl">{q.prompt}</p>
            {q.hint && <p className="text-sm text-gray-400">{q.hint}</p>}
            <p className="text-xs text-gray-500">填入空格的英文字</p>
          </div>
        )}
        {q.type === 'typing' && (
          <div className="space-y-1">
            <p className="text-2xl">{q.prompt}</p>
            <p className="text-xs text-gray-500">拼出對應的英文字</p>
          </div>
        )}

        {/* answer area */}
        <div className="mt-4 w-full">
          {q.type === 'mc' && options && (
            <div className="grid gap-2">
              {options.map((opt) => {
                const state = result
                  ? opt === q.answer ? 'border-green-500 bg-green-900/40'
                    : opt === picked ? 'border-red-500 bg-red-900/40' : 'border-gray-700 opacity-60'
                  : 'border-gray-700 hover:bg-gray-900'
                return (
                  <button key={opt} disabled={!!result} onClick={() => onPick(opt)}
                    className={`rounded-lg border px-4 py-3 text-left ${state}`}>{opt}</button>
                )
              })}
            </div>
          )}
          {q.type !== 'mc' && (
            <form onSubmit={onSubmitText} className="flex flex-col items-center gap-2">
              <input autoFocus value={input} onChange={(e) => setInput(e.target.value)} disabled={!!result}
                className="w-full rounded-lg border border-gray-700 bg-transparent px-4 py-3 text-center text-lg"
                placeholder="輸入英文單字" />
              {!result && <button type="submit" className="w-full rounded-lg bg-white py-3 font-medium text-black">作答</button>}
            </form>
          )}
        </div>

        {/* feedback */}
        {result && (
          <div className="mt-4">
            <p className={result.correct ? 'text-green-400' : 'text-red-400'}>
              {result.correct ? '答對了！' : '答錯了'}
            </p>
            <p className="mt-1 flex items-center justify-center gap-2 text-lg font-semibold">
              {q.answer}{q.type !== 'mc' && <TtsButton text={q.answer} />}
            </p>
          </div>
        )}
      </div>

      {result && (
        <button onClick={next} disabled={busy} className="mt-6 w-full rounded-lg bg-white py-3 font-medium text-black disabled:opacity-50">
          {index + 1 >= items.length ? '完成' : '下一個'}
        </button>
      )}
    </main>
  )
}
