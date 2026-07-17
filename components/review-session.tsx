'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { TtsButton } from '@/components/tts-button'
import { OptionButton } from '@/components/ui/option-button'
import { ProgressBar } from '@/components/ui/progress-bar'
import { CelebrateCard } from '@/components/ui/celebrate-card'
import { Button } from '@/components/ui/button'
import { LetterBoxes } from '@/components/letter-boxes'
import { Mascot, moodForSessionEnd } from '@/components/ui/mascot'
import { Confetti } from '@/components/ui/confetti'
import { checkAnswer, sample, seededRng, shortDef, type Question, type QuestionType } from '@/lib/learning/question'
import { submitAnswerAction, finishSessionAction } from '@/app/learn/[slug]/actions'
import type { Equipped } from '@/lib/shop/repository'
import type { ReviewReward, SessionReward } from '@/lib/gamification/types'

export interface ReviewItem {
  question: Question
  isSpotCheck: boolean
}

export type SubmitAnswerFn = (wordId: string, type: QuestionType, userAnswer: string) =>
  Promise<{ ok: boolean; mastered: boolean; correct: boolean; reward: ReviewReward | null }>
export type FinishSessionFn = (reviewed: number, correct: number) =>
  Promise<{ ok: boolean; reward: SessionReward | null }>

export function ReviewSession({ bookName, bookSlug, items, equipped, submit, finish, offlineMode }: {
  bookName: string; bookSlug: string; items: ReviewItem[]; equipped?: Equipped
  submit?: SubmitAnswerFn; finish?: FinishSessionFn; offlineMode?: boolean
}) {
  const router = useRouter()
  const submitFn: SubmitAnswerFn = submit ?? submitAnswerAction
  const finishFn: FinishSessionFn = finish ?? finishSessionAction
  // mixed-practice slug has no book page; send "back" to the book list instead.
  const backHref = bookSlug === 'all' ? '/books' : `/books/${bookSlug}`
  const [index, setIndex] = useState(0)
  const [input, setInput] = useState('')
  const [picked, setPicked] = useState<string | null>(null)
  const [result, setResult] = useState<null | { correct: boolean }>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [rewards, setRewards] = useState({ xp: 0, coins: 0, level: null as number | null, badges: [] as string[] })
  const [correctCount, setCorrectCount] = useState(0)
  const [sessionPerfect, setSessionPerfect] = useState(false)
  // 完成當下這輪的題數快照——因為 finishSession 後 router.refresh() 會把 items 換成「重抓後」的佇列
  const [finishedTotal, setFinishedTotal] = useState(0)

  const item = items[index]
  // 以 wordId 為種子做確定性洗牌：SSR 與 client 產生相同順序，避免 hydration 不匹配。
  // （safe when item is undefined, e.g. after a refresh shrinks the queue）
  const options = useMemo(() => {
    const opts = item?.question.options
    return opts ? sample(opts, opts.length, seededRng(item.question.wordId)) : null
  }, [item])

  // 「再來一輪」：重置作答狀態並重抓伺服器資料（可能是新一批到期卡，或已無待複習）
  function restart() {
    setIndex(0)
    setInput('')
    setPicked(null)
    setResult(null)
    setDone(false)
    setRewards({ xp: 0, coins: 0, level: null, badges: [] })
    setCorrectCount(0)
    setSessionPerfect(false)
    router.refresh()
  }

  // 結束慶祝畫面
  if (done) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col items-center justify-center gap-3 px-4 py-12 text-center">
        <Confetti className="mx-auto" />
        <Mascot mood={moodForSessionEnd({ correct: correctCount, total: finishedTotal })} size={132} className="mx-auto" equipped={equipped} />
        <h1 className="text-2xl font-extrabold text-neutral-900">完成！</h1>
        <p className="text-sm text-neutral-600">本次複習了 {finishedTotal} 個單字</p>
        {offlineMode ? (
          <p className="mt-2 text-sm font-semibold text-neutral-600">已記錄 {finishedTotal} 題，回線後入帳</p>
        ) : (
          <div className="mt-2 grid w-full max-w-xs gap-2">
            <CelebrateCard tone="reward">+{rewards.xp} XP</CelebrateCard>
            {rewards.coins > 0 && <CelebrateCard tone="coin">+{rewards.coins} 🪙</CelebrateCard>}
            {rewards.level !== null && <CelebrateCard tone="level">升級到 Lv.{rewards.level}！</CelebrateCard>}
            {sessionPerfect && <CelebrateCard tone="mastery">完美一回，全部答對！</CelebrateCard>}
            {rewards.badges.length > 0 && <CelebrateCard tone="mastery">🏆 {rewards.badges.join('、')}</CelebrateCard>}
          </div>
        )}
        <div className="mt-6 flex justify-center gap-4">
          <Link href={backHref} className="text-sm font-semibold text-neutral-600 hover:text-neutral-900">← 回單字書</Link>
          {!offlineMode && <button onClick={restart} className="text-sm font-bold text-primary-600 hover:underline">再來一輪</button>}
        </div>
      </main>
    )
  }

  // 佇列已空（例如重抓後今天已無待複習，或索引越界）——溫和收尾，避免存取 undefined
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

  async function commit(userAnswer: string) {
    if (busy) return
    setBusy(true)
    const localCorrect = evaluate(userAnswer)
    setResult({ correct: localCorrect })
    if (localCorrect) setCorrectCount((n) => n + 1)
    try {
      const res = await submitFn(q.wordId, q.type, userAnswer)
      const r = res.reward
      if (r) {
        setRewards((prev) => ({
          xp: prev.xp + r.xpGained,
          coins: prev.coins + r.coinsGained,
          level: r.leveledUpTo ?? prev.level,
          badges: [...prev.badges, ...r.newBadges],
        }))
      }
    } catch { /* 讓使用者繼續 */ }
    setBusy(false)
  }

  function onPick(opt: string) { if (result) return; setPicked(opt); void commit(opt) }

  // 「不會，看答案」：以空作答提交 → 後端判錯並記錄複習，接著 feedback 顯示正解、出現下一題按鈕。
  function reveal() { if (result || busy) return; void commit('') }


  async function next() {
    if (busy) return
    if (index + 1 >= items.length) {
      setBusy(true)
      setFinishedTotal(items.length)
      try {
        const res = await finishFn(items.length, correctCount)
        if (res.reward) {
          setSessionPerfect(res.reward.perfect)
          if (res.reward.newBadges.length) {
            setRewards((prev) => ({ ...prev, badges: [...prev.badges, ...res.reward!.newBadges] }))
          }
        }
      } catch { /* ignore */ }
      setDone(true)
      if (!offlineMode) router.refresh()
      return
    }
    setIndex(index + 1)
    setInput(''); setPicked(null); setResult(null)
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
              <LetterBoxes key={q.wordId} answer={q.answer} disabled={!!result} revealed={!!result} onComplete={(v) => { if (!result) { setInput(v); void commit(v) } }} />
              {!result && (
                <button
                  type="button"
                  onClick={reveal}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-pill border-2 border-neutral-200 bg-surface px-4 py-2 text-sm font-semibold text-neutral-500 transition hover:border-neutral-300 hover:bg-neutral-100 hover:text-neutral-700 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
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
            {/* mc has no boxes → show the answer text; typing/cloze already show it in the boxes, just offer TTS */}
            <p className="mt-1 flex items-center justify-center gap-2 text-lg font-semibold text-neutral-900">
              {q.type === 'mc' ? shortDef(q.answer) : <TtsButton text={q.answer} />}
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
