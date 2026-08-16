import { describe, it, expect, vi } from 'vitest'
import { clampReadSeconds, handlePassageSubmit } from '@/app/api/passage/submit/handler'
import type { PassageData } from '@/lib/reading/types'

const NOW = new Date('2026-08-17T10:00:00Z')
const user = { id: 'u1', email: 'a@b.c', name: null, image: null }

const PASSAGE = {
  id: 'p1', slug: 's1', kind: 'toeic', title: 'T', titleZh: null, level: null, topic: null,
  source: 'self-made', wordCount: 10, content: [], glossary: {},
  questions: [
    { id: 'q1', type: 'main', stem: '?', options: ['A', 'B', 'C', 'D'], answer: 0 },
    { id: 'q2', type: 'detail', stem: '?', options: ['A', 'B', 'C', 'D'], answer: 3 },
    { id: 'q3', type: 'inference', stem: '?', options: ['A', 'B', 'C', 'D'], answer: 1 },
  ],
} as unknown as PassageData

function makeDeps(firstCompletion = true) {
  const published: unknown[] = []
  return {
    published,
    deps: {
      getPassageBySlug: vi.fn(async (slug: string) => (slug === 's1' ? PASSAGE : null)),
      saveResult: vi.fn(async () => ({ firstCompletion })),
      bus: { publish: async (e: unknown) => { published.push(e) } },
      applyPassageFinish: vi.fn(async () => ({ xpGained: 25, leveledUpTo: null })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  }
}

describe('clampReadSeconds', () => {
  it('非數字回 null；取整並 clamp 10–3600', () => {
    expect(clampReadSeconds(undefined)).toBeNull()
    expect(clampReadSeconds('60')).toBeNull()
    expect(clampReadSeconds(NaN)).toBeNull()
    expect(clampReadSeconds(3)).toBe(10)
    expect(clampReadSeconds(99999)).toBe(3600)
    expect(clampReadSeconds(61.7)).toBe(61)
  })
})

describe('handlePassageSubmit', () => {
  it('server 逐題判分，作答後才揭露正解', async () => {
    const { deps } = makeDeps()
    const res = await handlePassageSubmit(user, { slug: 's1', answers: [0, 1, 1], readSeconds: 60 }, deps, NOW)
    expect(res.ok).toBe(true)
    expect(res.results).toEqual([
      { correct: true, answer: 0 }, { correct: false, answer: 3 }, { correct: true, answer: 1 },
    ])
    expect(res.correctCount).toBe(2)
    expect(deps.saveResult).toHaveBeenCalledWith('u1', 'p1', { correctCount: 2, totalCount: 3, readSeconds: 60 })
  })

  it('首次完成：發 PassageFinished 並給 reward', async () => {
    const { deps, published } = makeDeps(true)
    const res = await handlePassageSubmit(user, { slug: 's1', answers: [0, 3, 1] }, deps, NOW)
    expect(res.firstCompletion).toBe(true)
    expect(res.reward).toEqual({ xpGained: 25, leveledUpTo: null })
    expect(published).toEqual([{ type: 'PassageFinished', userId: 'u1', passageId: 'p1', correctCount: 3, totalCount: 3, at: NOW }])
  })

  it('重做：不發事件、不給 reward', async () => {
    const { deps, published } = makeDeps(false)
    const res = await handlePassageSubmit(user, { slug: 's1', answers: [0, 3, 1] }, deps, NOW)
    expect(res.firstCompletion).toBe(false)
    expect(res.reward).toBeNull()
    expect(published).toHaveLength(0)
    expect(deps.applyPassageFinish).not.toHaveBeenCalled()
  })

  it('gamification 失敗不阻斷：reward 為 null、其餘照常', async () => {
    const { deps } = makeDeps(true)
    deps.applyPassageFinish.mockRejectedValue(new Error('boom'))
    const res = await handlePassageSubmit(user, { slug: 's1', answers: [0, 3, 1] }, deps, NOW)
    expect(res.ok).toBe(true)
    expect(res.reward).toBeNull()
  })

  it('拒絕：未登入、查無 slug、answers 長度不符或值域外', async () => {
    const { deps } = makeDeps()
    expect((await handlePassageSubmit(null, { slug: 's1', answers: [0, 0, 0] }, deps, NOW)).ok).toBe(false)
    expect((await handlePassageSubmit(user, { slug: 'nope', answers: [0, 0, 0] }, deps, NOW)).ok).toBe(false)
    expect((await handlePassageSubmit(user, { slug: 's1', answers: [0, 0] }, deps, NOW)).ok).toBe(false)
    expect((await handlePassageSubmit(user, { slug: 's1', answers: [0, 0, 9] }, deps, NOW)).ok).toBe(false)
    expect((await handlePassageSubmit(user, { slug: 's1', answers: 'x' }, deps, NOW)).ok).toBe(false)
  })
})
