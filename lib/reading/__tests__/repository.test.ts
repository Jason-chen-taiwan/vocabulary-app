import { describe, it, expect, vi } from 'vitest'
import { PassageRepository, toPassagePayload } from '@/lib/reading/repository'
import type { PassageData } from '@/lib/reading/types'

function makeDb() {
  return {
    passage: { findMany: vi.fn(), findUnique: vi.fn() },
    passageResult: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    userCard: { findMany: vi.fn() },
  }
}

const ROW = {
  id: 'p1', slug: 's1', kind: 'toeic', title: 'T', titleZh: null, level: 'L1', topic: 'office',
  source: 'self-made', wordCount: 1, order: 0,
  content: [[{ w: 'run', l: 'run' }]],
  glossary: { run: { zh: '跑' } },
  questions: [{ id: 'q1', type: 'main', stem: 'Q?', options: ['A', 'B', 'C', 'D'], answer: 2 }],
}

describe('PassageRepository', () => {
  it('getPassageBySlug 把 Json 欄位映成宣告型別', async () => {
    const db = makeDb(); db.passage.findUnique.mockResolvedValue(ROW)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const repo = new PassageRepository(db as any)
    const p = await repo.getPassageBySlug('s1')
    expect(p?.questions[0].answer).toBe(2)
    expect(db.passage.findUnique).toHaveBeenCalledWith({ where: { slug: 's1' } })
  })

  it('saveResult 首次 create 回 firstCompletion: true，之後 update 回 false', async () => {
    const db = makeDb()
    db.passageResult.findUnique.mockResolvedValueOnce(null)
    db.passageResult.create.mockResolvedValue({})
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const repo = new PassageRepository(db as any)
    const r1 = await repo.saveResult('u1', 'p1', { correctCount: 2, totalCount: 3, readSeconds: 60 })
    expect(r1.firstCompletion).toBe(true)
    db.passageResult.findUnique.mockResolvedValueOnce({ id: 'r1' })
    db.passageResult.update.mockResolvedValue({})
    const r2 = await repo.saveResult('u1', 'p1', { correctCount: 3, totalCount: 3, readSeconds: 50 })
    expect(r2.firstCompletion).toBe(false)
    expect(db.passageResult.update).toHaveBeenCalledWith({
      where: { userId_passageId: { userId: 'u1', passageId: 'p1' } },
      data: { correctCount: 3, totalCount: 3, readSeconds: 50 },
    })
  })

  it('listCollectedLemmas 併查精修 wordId 卡與生字本 headword 卡', async () => {
    const db = makeDb()
    db.userCard.findMany
      .mockResolvedValueOnce([{ wordId: 'w-run' }])                                  // 精修卡
      .mockResolvedValueOnce([{ word: { headword: 'zealous' } }])                    // 生字本卡
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const repo = new PassageRepository(db as any)
    const out = await repo.listCollectedLemmas('u1', [
      { lemma: 'run', wordId: 'w-run' }, { lemma: 'zealous' }, { lemma: 'walk', wordId: 'w-walk' },
    ])
    expect(out.sort()).toEqual(['run', 'zealous'])
  })
})

describe('toPassagePayload', () => {
  it('剝掉每題的 answer', () => {
    const payload = toPassagePayload(ROW as unknown as PassageData)
    expect(payload.questions).toHaveLength(1)
    expect('answer' in payload.questions[0]).toBe(false)
    expect(JSON.stringify(payload)).not.toContain('"answer"')
  })
})
