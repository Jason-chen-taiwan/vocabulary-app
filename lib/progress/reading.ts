import type { Progress } from './store'

// 閱讀進度：短文成績與生字本，同樣存在 localStorage（沿用 Progress 物件）。
// 原本這些是後端 PassageResult / 生字本 API；單人版沒有共享狀態，前端判題即可。

export interface PassageResultEntry {
  correctCount: number
  totalCount: number
  readSeconds: number | null
  completedAt: string
}

export interface NotebookEntry {
  lemma: string
  zh: string
  pos?: string
  /** 從哪篇文章收集的，之後想回頭看上下文用。 */
  passageSlug: string
  collectedAt: string
}

export interface GradeResult {
  results: { correct: boolean; answer: number }[]
  correctCount: number
  totalCount: number
}

/**
 * 判題：把作答與正解逐題比對。
 * 原本在 server（防止前端偽造成績上排行榜）；單人版沒有排名，前端判即可。
 */
export function gradePassage(answers: (number | null)[], key: number[]): GradeResult {
  const results = key.map((answer, i) => ({ correct: answers[i] === answer, answer }))
  return {
    results,
    correctCount: results.filter((r) => r.correct).length,
    totalCount: results.length,
  }
}

export function passageResult(p: Progress, slug: string): PassageResultEntry | null {
  return p.passages?.[slug] ?? null
}

export function recordPassageResult(
  p: Progress,
  slug: string,
  r: { correctCount: number; totalCount: number; readSeconds: number | null },
): { progress: Progress; firstCompletion: boolean } {
  const passages = p.passages ?? {}
  const firstCompletion = !passages[slug]
  return {
    firstCompletion,
    progress: {
      ...p,
      passages: {
        ...passages,
        [slug]: { ...r, completedAt: new Date().toISOString() },
      },
    },
  }
}

export function isCollected(p: Progress, lemma: string): boolean {
  return (p.notebook ?? []).some((w) => w.lemma === lemma)
}

/** 最新收集的排前面。 */
export function listNotebook(p: Progress): NotebookEntry[] {
  return p.notebook ?? []
}

export function collectWord(
  p: Progress,
  w: { lemma: string; zh: string; pos?: string; passageSlug: string },
): Progress {
  if (isCollected(p, w.lemma)) return p
  const entry: NotebookEntry = { ...w, collectedAt: new Date().toISOString() }
  return { ...p, notebook: [entry, ...(p.notebook ?? [])] }
}
