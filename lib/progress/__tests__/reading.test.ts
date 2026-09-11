import { describe, it, expect, beforeEach } from 'vitest'
import { emptyProgress } from '../store'
import {
  gradePassage, recordPassageResult, collectWord, isCollected,
  listNotebook, passageResult,
} from '../reading'

class MemStorage {
  private m = new Map<string, string>()
  getItem(k: string) { return this.m.get(k) ?? null }
  setItem(k: string, v: string) { this.m.set(k, v) }
  removeItem(k: string) { this.m.delete(k) }
  clear() { this.m.clear() }
}

beforeEach(() => {
  ;(globalThis as { localStorage?: unknown }).localStorage = new MemStorage()
})

describe('gradePassage', () => {
  it('marks each answer against the key', () => {
    const out = gradePassage([0, 2, 1], [0, 1, 1])
    expect(out.results.map((r) => r.correct)).toEqual([true, false, true])
    expect(out.correctCount).toBe(2)
    expect(out.totalCount).toBe(3)
  })

  it('always reports the correct answer, even when wrong', () => {
    const out = gradePassage([3], [1])
    expect(out.results[0]).toEqual({ correct: false, answer: 1 })
  })

  it('treats an unanswered question as wrong', () => {
    const out = gradePassage([null], [2])
    expect(out.results[0].correct).toBe(false)
    expect(out.correctCount).toBe(0)
  })

  it('handles a passage with no questions', () => {
    const out = gradePassage([], [])
    expect(out).toEqual({ results: [], correctCount: 0, totalCount: 0 })
  })
})

describe('recordPassageResult', () => {
  it('stores the result and flags a first completion', () => {
    const p = emptyProgress()
    const next = recordPassageResult(p, 'slug-a', { correctCount: 2, totalCount: 3, readSeconds: 60 })
    expect(next.firstCompletion).toBe(true)
    expect(passageResult(next.progress, 'slug-a')).toMatchObject({ correctCount: 2, totalCount: 3 })
  })

  it('is not a first completion the second time', () => {
    let p = emptyProgress()
    p = recordPassageResult(p, 'slug-a', { correctCount: 1, totalCount: 3, readSeconds: 60 }).progress
    const again = recordPassageResult(p, 'slug-a', { correctCount: 3, totalCount: 3, readSeconds: 40 })
    expect(again.firstCompletion).toBe(false)
    // 成績仍然更新成最新一次
    expect(passageResult(again.progress, 'slug-a')?.correctCount).toBe(3)
  })

  it('keeps results for different passages apart', () => {
    let p = emptyProgress()
    p = recordPassageResult(p, 'a', { correctCount: 1, totalCount: 2, readSeconds: null }).progress
    p = recordPassageResult(p, 'b', { correctCount: 2, totalCount: 2, readSeconds: null }).progress
    expect(passageResult(p, 'a')?.correctCount).toBe(1)
    expect(passageResult(p, 'b')?.correctCount).toBe(2)
  })

  it('returns null for a passage never read', () => {
    expect(passageResult(emptyProgress(), 'nope')).toBeNull()
  })
})

describe('notebook', () => {
  it('collects a word with its gloss', () => {
    const p = collectWord(emptyProgress(), { lemma: 'mitigate', zh: '減輕', passageSlug: 'a' })
    expect(isCollected(p, 'mitigate')).toBe(true)
    expect(listNotebook(p)).toHaveLength(1)
    expect(listNotebook(p)[0]).toMatchObject({ lemma: 'mitigate', zh: '減輕' })
  })

  it('does not duplicate a word collected twice', () => {
    let p = collectWord(emptyProgress(), { lemma: 'mitigate', zh: '減輕', passageSlug: 'a' })
    p = collectWord(p, { lemma: 'mitigate', zh: '減輕', passageSlug: 'b' })
    expect(listNotebook(p)).toHaveLength(1)
  })

  it('reports uncollected words as not collected', () => {
    expect(isCollected(emptyProgress(), 'anything')).toBe(false)
  })

  it('keeps newest collected words first', () => {
    let p = collectWord(emptyProgress(), { lemma: 'first', zh: '一', passageSlug: 'a' })
    p = collectWord(p, { lemma: 'second', zh: '二', passageSlug: 'a' })
    expect(listNotebook(p).map((w) => w.lemma)).toEqual(['second', 'first'])
  })
})
