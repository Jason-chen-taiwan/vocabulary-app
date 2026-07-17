import { describe, it, expect } from 'vitest'
import { buildReviewItems } from '../review-items'
import type { LearningRepository } from '../repository'

const W = (id: string, headword: string, definitionZh: string) => ({
  id, headword, phonetic: null, partOfSpeech: 'n.', definitionZh, examTags: [], examples: [],
})

function deps(opts: { due?: { wordId: string; consecutiveCorrect: number }[]; newIds?: string[]; defs?: string[] }) {
  const learning = {
    listDueCards: async () => opts.due ?? [],
    listNewWordIds: async () => opts.newIds ?? [],
    listMasteredWordIds: async () => [],
  } as unknown as LearningRepository
  const content = {
    listWordsWithExamplesByIds: async (ids: string[]) =>
      ids.map((id) => W(id, `hw-${id}`, `def-${id}`)),
    listAllDefinitions: async () => opts.defs ?? [],
    listWordsByBook: async () => (opts.defs ?? []).map((definitionZh) => ({ definitionZh })),
  }
  return { learning, content }
}

describe('buildReviewItems', () => {
  it('mc 題有 4 個選項且干擾不含正解', async () => {
    const d = deps({ newIds: ['w1'], defs: ['def-w1', 'X', 'Y', 'Z', 'W'] })
    const items = await buildReviewItems(
      { userId: 'u1', book: { id: 'bk1' }, now: new Date(), newLimit: 20, dueLimit: 100, spotCheckLimit: 3, rng: () => 0.5 },
      d,
    )
    expect(items).toHaveLength(1)
    const q = items[0].question
    expect(q.type).toBe('mc')
    expect(q.options).toHaveLength(4)
    expect(q.options).toContain('def-w1')
    expect(q.options!.filter((o) => o === 'def-w1')).toHaveLength(1)
  })

  it('book=null（mixed）用 listAllDefinitions 當干擾池', async () => {
    let usedAll = false
    const d = deps({ newIds: ['w1'], defs: ['A', 'B', 'C'] })
    d.content.listAllDefinitions = async () => { usedAll = true; return ['A', 'B', 'C'] }
    await buildReviewItems(
      { userId: 'u1', book: null, now: new Date(), newLimit: 20, dueLimit: 100, spotCheckLimit: 3 },
      d,
    )
    expect(usedAll).toBe(true)
  })

  it('查不到字卡資料的 item 靜默略過', async () => {
    const d = deps({ newIds: ['w1', 'w2'] })
    d.content.listWordsWithExamplesByIds = async () => [W('w1', 'hw', 'def')]
    const items = await buildReviewItems(
      { userId: 'u1', book: { id: 'bk1' }, now: new Date(), newLimit: 20, dueLimit: 100, spotCheckLimit: 3 },
      d,
    )
    expect(items.map((i) => i.question.wordId)).toEqual(['w1'])
  })
})
