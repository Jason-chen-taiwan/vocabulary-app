'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { TtsButton } from '@/components/tts-button'
import { OptionButton } from '@/components/ui/option-button'
import { ProgressBar } from '@/components/ui/progress-bar'
import { CelebrateCard } from '@/components/ui/celebrate-card'
import { Button } from '@/components/ui/button'
import { LetterBoxes } from '@/components/letter-boxes'
import { Mascot, moodForSessionEnd } from '@/components/ui/mascot'
import { Confetti } from '@/components/ui/confetti'
import { checkAnswer, sample, seededRng, shortDef, type Question } from '@/lib/learning/question'
import { loadProgress, saveProgress, recordReview, todayStats } from '@/lib/progress/store'
import { TIMEZONE } from '@/lib/progress/config'

export interface ReviewItem {
  question: Question
  isSpotCheck: boolean
}

export function ReviewSession({
  bookName, bookSlug, items, onRestart,
}: {
  bookName: string
  bookSlug: string
  items: ReviewItem[]
  /** 由頁面提供：重新依最新進度組佇列（取代原本的 router.refresh()）。 */
  onRestart: () => void
}) {
  // mixed-practice slug has no book page; send "back" to the book list instead.
  const backHref = bookSlug === 'all' ? '/books' : `/books/${bookSlug}`
  const [index, setIndex] = useState(0)
  const [picked, setPicked] = useState<string | null>(null)
  const [result, setResult] = useState<null | { correct: boolean }>(null)
  const [done, setDone] = useState(false)
  const [correctCount, setCorrectCount] = useState(0)
  const [streak, setStreak] = useState<number | null>(null)
  const [todayCount, setTodayCount] = useState(0)
  // 完成當下這輪的題數快照
  const [finishedTotal, setFinishedTotal] = useState(0)

  const item = items[index]
  // 以 wordId 為種子做確定性洗牌，避免每次 render 選項跳動。
  const options = useMemo(() => {
    const opts = item?.question.options
    return opts ? sample(opts, opts.length, seededRng(item.question.wordId)) : null
  }, [item])

  function restart() {
    setIndex(0)
    setPicked(null)
    setResult(null)
    setDone(false)
    setCorrectCount(0)
    setStreak(null)
    onRestart()
  }

  // 結束慶祝畫面
  if (done) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col items-center justify-center gap-3 px-4 py-12 text-center">
        <Confetti className="mx-auto" />
        <Mascot mood={moodForSessionEnd({ correct: correctCount, total: finishedTotal })} size={132} className="mx-auto" />
        <h1 className="text-2xl font-extrabold text-neutral-900">完成！</h1>
        <p className="text-sm text-neutral-600">本次複習了 {finishedTotal} 個單字，答對 {correctCount} 題</p>
        <div className="mt-2 grid w-full max-w-xs gap-2">
          {streak !== null && <CelebrateCard tone="reward">🔥 連續學習 {streak} 天</CelebrateCard>}
          <CelebrateCard tone="coin">今日累計 {todayCount} 題</CelebrateCard>
          {finishedTotal > 0 && correctCount === finishedTotal && (
            <CelebrateCard tone="mastery">完美一回，全部答對！</CelebrateCard>
          )}
        </div>
        <div className="mt-6 flex justify-center gap-4">
          <Link href={backHref} className="text-sm font-semibold text-neutral-600 hover:text-neutral-900">← 回單字書</Link>
          <button onClick={restart} className="text-sm font-bold text-primary-600 hover:underline">再來一輪</button>
        </div>
      </main>
    )
  }

  // 佇列已空——溫和收尾，避免存取 undefined
  if (!item) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col items-center justify-center gap-3 px-4 py-12 text-center">
        <Mascot mood="cheer" size={120} className="mx-auto" />
        <h1 className="text-2xl font-extrabold text-neutral-900">{bookName}</h1>
        <p className="mt-2 text-neutral-600">今天沒有待複習的單字了 🎉</p>
        <Link href={backHref} className="mt-4 text-sm font-semibold text-primary-600 hover:underline">← 回單字書</Link>
      </main>
    )
  }

  const q = item.question

  function evaluate(answer: string): boolean {
    return q.type === 'mc' ? answer === q.answer : checkAnswer(answer, q.answer)
  }

  // 單人版：對錯在本機判定後直接寫進 localStorage（沒有伺服器可以權威判定，也沒有排名可作弊）。
  function commit(userAnswer: string) {
    if (result) return
    const correct = evaluate(userAnswer)
    setResult({ correct })
    if (correct) setCorrectCount((n) => n + 1)

    const now = new Date()
    const next = recordReview(loadProgress(), q.wordId, correct, now, TIMEZONE)
    saveProgress(next)
    setStreak(next.streak)
    setTodayCount(todayStats(next, now, TIMEZONE).reviews)
  }

  function onPick(opt: string) { if (result) return; setPicked(opt); commit(opt) }

  // 「不會，看答案」：以空作答提交 → 記為答錯並重新排程。
  function reveal() { if (result) return; commit('') }

  function next() {
    if (index + 1 >= items.length) {
      setFinishedTotal(items.length)
      setDone(true)
      return
    }
    setIndex(index + 1)
    setPicked(null); setResult(null)
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col px-4 py-8">
      <div className="mb-2 flex items-center justify-between text-sm text-neutral-600">
        <Link href={backHref} className="hover:underline">← {bookName}</Link>
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
                    {shortDef(opt)}
                  </OptionButton>
                )
              })}
            </div>
          )}
          {q.type !== 'mc' && (
            <div className="flex flex-col items-center gap-5">
              <LetterBoxes key={q.wordId} answer={q.answer} disabled={!!result} revealed={!!result} onComplete={(v) => { if (!result) commit(v) }} />
              {!result && (
                <button
                  type="button"
                  onClick={reveal}
                  className="inline-flex items-center gap-1.5 rounded-pill border-2 border-neutral-200 bg-surface px-4 py-2 text-sm font-semibold text-neutral-500 transition hover:border-neutral-300 hover:bg-neutral-100 hover:text-neutral-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
                >
                  <span aria-hidden>💡</span>
                  不會，看答案
                </button>
              )}
            </div>
          )}
        </div>

        {/* feedback */}
        {result && (
          <div className="mt-4">
            <p className={`font-bold ${result.correct ? 'text-success' : 'text-error'}`}>
              {result.correct ? '答對了！' : '答錯了'}
            </p>
            <p className="mt-1 flex items-center justify-center gap-2 text-lg font-semibold text-neutral-900">
              {q.type === 'mc' ? shortDef(q.answer) : <TtsButton text={q.answer} />}
            </p>
          </div>
        )}
      </div>

      {result && (
        <Button variant="primary" fullWidth onClick={next} className="mt-6">
          {index + 1 >= items.length ? '完成' : '下一個'}
        </Button>
      )}
    </main>
  )
}
