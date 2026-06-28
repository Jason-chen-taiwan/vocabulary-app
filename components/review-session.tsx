'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { TtsButton } from '@/components/tts-button'
import { OptionButton } from '@/components/ui/option-button'
import { ProgressBar } from '@/components/ui/progress-bar'
import { CelebrateCard } from '@/components/ui/celebrate-card'
import { Button } from '@/components/ui/button'
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
  const [rewards, setRewards] = useState({ xp: 0, coins: 0, level: null as number | null, badges: [] as string[] })
  const [correctCount, setCorrectCount] = useState(0)
  const [sessionPerfect, setSessionPerfect] = useState(false)

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
    if (correct) setCorrectCount((n) => n + 1)
    try {
      const res = await submitAnswerAction(q.wordId, correct)
      const r = res.reward
      if (r) {
        setRewards((prev) => ({
          xp: prev.xp + r.xpGained,
          coins: prev.coins + r.coinsGained,
          level: r.leveledUpTo ?? prev.level,
          badges: [...prev.badges, ...r.newBadges],
        }))
      }
    } catch {
      // 即使出錯也讓使用者繼續；本卡進度可能未存
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
    if (busy) return
    if (index + 1 >= items.length) {
      setBusy(true)
      try {
        const res = await finishSessionAction(items.length, correctCount)
        if (res.reward) {
          setSessionPerfect(res.reward.perfect)
          if (res.reward.newBadges.length) {
            setRewards((prev) => ({ ...prev, badges: [...prev.badges, ...res.reward!.newBadges] }))
          }
        }
      } catch { /* ignore */ }
      router.refresh()
      setDone(true)
      return
    }
    setIndex(index + 1)
    setInput(''); setPicked(null); setResult(null)
  }

  if (done) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col items-center justify-center gap-3 px-4 py-12 text-center">
        <div className="text-5xl">🎉</div>
        <h1 className="text-2xl font-extrabold text-neutral-900">完成！</h1>
        <p className="text-sm text-neutral-600">本次複習了 {items.length} 個單字</p>
        <div className="mt-2 grid w-full max-w-xs gap-2">
          <CelebrateCard tone="reward">+{rewards.xp} XP</CelebrateCard>
          {rewards.coins > 0 && <CelebrateCard tone="coin">+{rewards.coins} 🪙</CelebrateCard>}
          {rewards.level !== null && <CelebrateCard tone="level">升級到 Lv.{rewards.level}！</CelebrateCard>}
          {sessionPerfect && <CelebrateCard tone="mastery">完美一回，全部答對！</CelebrateCard>}
          {rewards.badges.length > 0 && <CelebrateCard tone="mastery">🏆 {rewards.badges.join('、')}</CelebrateCard>}
        </div>
        <div className="mt-6 flex justify-center gap-4">
          <Link href={`/books/${bookSlug}`} className="text-sm font-semibold text-neutral-600 hover:text-neutral-900">← 回單字書</Link>
          <button onClick={() => router.refresh()} className="text-sm font-bold text-primary-600 hover:underline">再來一輪</button>
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col px-4 py-8">
      <div className="mb-2 flex items-center justify-between text-sm text-neutral-600">
        <Link href={`/books/${bookSlug}`} className="hover:underline">← {bookName}</Link>
        <span>{index + 1} / {items.length}</span>
      </div>
      <ProgressBar value={index + 1} max={items.length} />

      <div className="flex flex-1 flex-col items-center gap-4 text-center mt-6">
        {item.isSpotCheck && <span className="bg-mastery text-white rounded-pill px-2 py-0.5 text-xs">記憶抽考</span>}

        {/* prompt */}
        {q.type === 'mc' && (
          <div className="flex items-center gap-2">
            <span className="text-4xl font-bold text-neutral-900">{q.prompt}</span>
            {q.audioText && <TtsButton text={q.audioText} />}
          </div>
        )}
        {q.type === 'cloze' && (
          <div className="space-y-2">
            <p className="text-2xl text-neutral-900">{q.prompt}</p>
            {q.hint && <p className="text-sm text-neutral-600">{q.hint}</p>}
            <p className="text-xs text-neutral-600">填入空格的英文字</p>
          </div>
        )}
        {q.type === 'typing' && (
          <div className="space-y-1">
            <p className="text-2xl text-neutral-900">{q.prompt}</p>
            <p className="text-xs text-neutral-600">拼出對應的英文字</p>
          </div>
        )}

        {/* answer area */}
        <div className="mt-4 w-full">
          {q.type === 'mc' && options && (
            <div className="grid gap-2">
              {options.map((opt) => {
                const st = result
                  ? opt === q.answer ? 'correct' : opt === picked ? 'wrong' : 'dimmed'
                  : 'idle'
                return (
                  <OptionButton key={opt} state={st as 'idle'|'correct'|'wrong'|'dimmed'} disabled={!!result} onClick={() => onPick(opt)}>
                    {opt}
                  </OptionButton>
                )
              })}
            </div>
          )}
          {q.type !== 'mc' && (
            <form onSubmit={onSubmitText} className="flex flex-col items-center gap-2">
              <input autoFocus value={input} onChange={(e) => setInput(e.target.value)} disabled={!!result}
                className="w-full rounded-control border-2 border-primary-200 bg-surface px-4 py-3 text-center text-lg text-neutral-900 focus:border-primary-500 focus:outline-none"
                placeholder="輸入英文單字" />
              {!result && <Button type="submit" fullWidth>作答</Button>}
            </form>
          )}
        </div>

        {/* feedback */}
        {result && (
          <div className="mt-4">
            <p className={result.correct ? 'text-success' : 'text-error'}>
              {result.correct ? '答對了！' : '答錯了'}
            </p>
            <p className="mt-1 flex items-center justify-center gap-2 text-lg font-semibold text-neutral-900">
              {q.answer}{q.type !== 'mc' && <TtsButton text={q.answer} />}
            </p>
          </div>
        )}
      </div>

      {result && (
        <Button variant="primary" fullWidth disabled={busy} onClick={next} className="mt-6">
          {index + 1 >= items.length ? '完成' : '下一個'}
        </Button>
      )}
    </main>
  )
}
