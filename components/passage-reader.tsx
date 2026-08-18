'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { TtsButton } from '@/components/tts-button'
import type { WordWithExamples } from '@/lib/content/types'
import type { PassagePayload } from '@/lib/reading/types'
import { GlossaryDictionary } from '@/lib/reading/dictionary'
import { readSecondsBetween, wpm } from '@/lib/reading/reader-logic'

const dictionary = new GlossaryDictionary()

interface SubmitResponse {
  ok: boolean
  results: { correct: boolean; answer: number }[]
  correctCount: number
  totalCount: number
  firstCompletion: boolean
  reward: { xpGained: number; leveledUpTo: number | null } | null
}

export function PassageReader({ passage, curatedWords, collectedLemmas, priorResult }: {
  passage: PassagePayload
  curatedWords: WordWithExamples[]
  collectedLemmas: string[]
  priorResult: { correctCount: number; totalCount: number } | null
}) {
  const curatedById = useMemo(() => new Map(curatedWords.map((w) => [w.id, w])), [curatedWords])
  const [collected, setCollected] = useState(() => new Set(collectedLemmas))
  const [selected, setSelected] = useState<string | null>(null) // lemma
  const [phase, setPhase] = useState<'reading' | 'quiz' | 'result'>('reading')
  const [answers, setAnswers] = useState<(number | null)[]>(() => passage.questions.map(() => null))
  const [outcome, setOutcome] = useState<SubmitResponse | null>(null)
  const [readSeconds, setReadSeconds] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  // 計時起點在 mount 後設定（render 中呼叫 Date.now() 違反 React 純渲染規則）
  const startMs = useRef<number | null>(null)
  useEffect(() => {
    if (startMs.current === null) startMs.current = Date.now()
  }, [])

  const entry = selected ? dictionary.lookup(selected, passage) : null // 查詞一律走 DictionaryService 隔離點
  const curated = entry?.wordId ? curatedById.get(entry.wordId) ?? null : null

  async function collect(lemma: string) {
    if (busy || collected.has(lemma)) return
    setBusy(true)
    try {
      const res = await fetch('/api/vocab/collect', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passageSlug: passage.slug, lemma }),
      })
      const data = await res.json().catch(() => ({ ok: false }))
      if (data.ok) setCollected((prev) => new Set(prev).add(lemma))
    } finally { setBusy(false) }
  }

  function startQuiz() {
    setReadSeconds(startMs.current === null ? null : readSecondsBetween(startMs.current, Date.now()))
    setPhase('quiz')
  }

  async function submit() {
    if (busy || answers.some((a) => a === null)) return
    setBusy(true)
    try {
      const res = await fetch('/api/passage/submit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: passage.slug, answers, readSeconds: readSeconds ?? undefined }),
      })
      const data: SubmitResponse = await res.json().catch(() => ({ ok: false, results: [], correctCount: 0, totalCount: 0, firstCompletion: false, reward: null }))
      if (data.ok) { setOutcome(data); setPhase('result') }
    } finally { setBusy(false) }
  }

  const speed = wpm(passage.wordCount, readSeconds)

  return (
    <div className="pb-28">
      {phase === 'reading' && (
        <article className="rounded-card bg-surface p-5 shadow-[0_12px_30px_rgba(255,106,61,.10)]">
          {passage.content.map((para, pi) => (
            <p key={pi} className="mb-4 leading-8 text-neutral-900">
              {para.map((t, ti) =>
                t.l ? (
                  <button
                    key={ti}
                    type="button"
                    onClick={() => setSelected(t.l ?? null)}
                    className={`rounded px-0.5 transition hover:bg-primary-100 ${
                      collected.has(t.l) ? 'bg-primary-100 text-primary-700'
                      : passage.glossary[t.l]?.wordId ? 'underline decoration-primary-300 decoration-dotted underline-offset-4' : ''
                    }`}
                  >{t.w}</button>
                ) : (
                  <span key={ti}>{t.w}</span>
                ),
              )}
            </p>
          ))}
          <button
            type="button"
            onClick={startQuiz}
            className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-control bg-primary-500 px-5 py-3 font-extrabold text-white shadow-[0_6px_14px_rgba(255,106,61,.35)] transition hover:bg-primary-600"
          >{passage.questions.length > 0 ? '開始作答 ✍️' : '標記完成 ✅'}</button>
          {priorResult && (
            <p className="mt-3 text-center text-sm text-neutral-600">
              上次成績：{priorResult.correctCount}/{priorResult.totalCount}
            </p>
          )}
        </article>
      )}

      {phase === 'quiz' && (
        <div className="space-y-4">
          {passage.questions.map((q, qi) => (
            <div key={q.id} className="rounded-card bg-surface p-5 shadow-[0_12px_30px_rgba(255,106,61,.10)]">
              <p className="font-extrabold text-neutral-900">{qi + 1}. {q.stem}</p>
              <div className="mt-3 space-y-2">
                {q.options.map((opt, oi) => (
                  <button
                    key={oi}
                    type="button"
                    onClick={() => setAnswers((prev) => prev.map((a, i) => (i === qi ? oi : a)))}
                    className={`block min-h-11 w-full rounded-control border px-4 py-2 text-left transition ${
                      answers[qi] === oi ? 'border-primary-500 bg-primary-50 font-bold text-primary-700' : 'border-neutral-200 hover:border-primary-300'
                    }`}
                  >{String.fromCharCode(65 + oi)}. {opt}</button>
                ))}
              </div>
            </div>
          ))}
          <button
            type="button"
            disabled={busy || answers.some((a) => a === null)}
            onClick={submit}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-control bg-primary-500 px-5 py-3 font-extrabold text-white shadow-[0_6px_14px_rgba(255,106,61,.35)] transition hover:bg-primary-600 disabled:opacity-40"
          >送出答案</button>
        </div>
      )}

      {phase === 'result' && outcome && (
        <div className="space-y-4">
          <div className="rounded-card bg-surface p-5 text-center shadow-[0_12px_30px_rgba(255,106,61,.10)]">
            <p className="text-2xl font-extrabold text-neutral-900">
              {outcome.totalCount > 0 ? `答對 ${outcome.correctCount}/${outcome.totalCount}` : '閱讀完成！'}
            </p>
            {speed !== null && <p className="mt-1 text-sm text-neutral-600">閱讀速度 {speed} WPM（{readSeconds} 秒）</p>}
            {outcome.reward && (
              <p className="mt-2 font-bold text-primary-600">
                +{outcome.reward.xpGained} XP{outcome.reward.leveledUpTo ? `，升到 Lv.${outcome.reward.leveledUpTo}！` : ''}
              </p>
            )}
            {!outcome.firstCompletion && outcome.totalCount > 0 && (
              <p className="mt-2 text-sm text-neutral-600">重讀不重複給獎，成績已更新</p>
            )}
          </div>
          {passage.questions.map((q, qi) => (
            <div key={q.id} className="rounded-card bg-surface p-5 shadow-[0_12px_30px_rgba(255,106,61,.10)]">
              <p className="font-extrabold text-neutral-900">
                {outcome.results[qi]?.correct ? '✅' : '❌'} {qi + 1}. {q.stem}
              </p>
              <p className="mt-2 text-sm text-neutral-600">
                正解：{String.fromCharCode(65 + (outcome.results[qi]?.answer ?? 0))}. {q.options[outcome.results[qi]?.answer ?? 0]}
              </p>
            </div>
          ))}
          <Link href="/read" className="block text-center text-sm font-bold text-primary-600 hover:underline">← 回文章列表</Link>
        </div>
      )}

      {/* 點字底部卡片 */}
      {selected && entry && (
        <div className="fixed inset-x-0 bottom-0 z-50">
          <button type="button" aria-label="關閉" onClick={() => setSelected(null)} className="fixed inset-0 cursor-default bg-black/20" />
          <div className="relative mx-auto max-w-2xl rounded-t-card bg-surface p-5 shadow-[0_-8px_30px_rgba(0,0,0,.15)]">
            <div className="flex items-center gap-3">
              <span className="text-xl font-extrabold text-neutral-900">{selected}</span>
              {(curated?.partOfSpeech ?? entry.pos) && (
                <span className="rounded-pill bg-primary-100 px-3 py-1 text-sm font-extrabold text-primary-600">{curated?.partOfSpeech ?? entry.pos}</span>
              )}
              <TtsButton text={selected} />
            </div>
            <p className="mt-2 text-neutral-900">{curated?.definitionZh ?? entry.zh}</p>
            {curated?.examples[0] && (
              <p className="mt-2 text-sm text-neutral-600">{curated.examples[0].sentence}<br />{curated.examples[0].translationZh}</p>
            )}
            <button
              type="button"
              disabled={busy || collected.has(selected)}
              onClick={() => collect(selected)}
              className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-control bg-primary-500 px-5 py-3 font-extrabold text-white shadow-[0_6px_14px_rgba(255,106,61,.35)] transition hover:bg-primary-600 disabled:opacity-60"
            >{collected.has(selected) ? '已在生字本 ✓' : '加入生字本 ➕'}</button>
          </div>
        </div>
      )}
    </div>
  )
}
