import { describe, it, expect } from 'vitest'
import { handleOfflinePack } from '../handler'

const user = { id: 'u1', email: 'a@b.c', name: null, image: null }

function deps(books: { id: string; slug: string; name: string }[], itemsPerBook: number) {
  return {
    learning: {
      listStartedBooks: async () => books,
      listDueCards: async () => Array.from({ length: itemsPerBook }, (_, i) => ({ wordId: `w${i}`, consecutiveCorrect: 0 })),
      listNewWordIds: async () => [],
      listMasteredWordIds: async () => [],
    },
    content: {
      listWordsWithExamplesByIds: async (ids: string[]) =>
        ids.map((id) => ({ id, headword: `hw-${id}`, phonetic: null, partOfSpeech: 'n.', definitionZh: `def-${id}`, examTags: [], examples: [] })),
      listAllDefinitions: async () => ['A', 'B', 'C', 'D'],
      listWordsByBook: async () => ['A', 'B', 'C', 'D'].map((definitionZh) => ({ definitionZh })),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

describe('handleOfflinePack', () => {
  it('未登入 → ok:false 空包', async () => {
    const res = await handleOfflinePack(null, deps([], 0), new Date())
    expect(res).toEqual({ ok: false, packs: [] })
  })

  it('每本有進度的書出一包；空 session 的書不出包', async () => {
    const res = await handleOfflinePack(
      user,
      deps([{ id: 'b1', slug: 'office', name: '辦公室' }, { id: 'b2', slug: 'empty', name: '空' }], 2),
      new Date(),
    )
    // fake 對兩本書都回 2 張 due 卡 → 兩包都有 items
    expect(res.ok).toBe(true)
    expect(res.packs.map((p) => p.slug)).toEqual(['office', 'empty'])
    expect(res.packs[0].items.length).toBeGreaterThan(0)
  })

  it('沒有進度書 → 空 packs', async () => {
    const res = await handleOfflinePack(user, deps([], 0), new Date())
    expect(res).toEqual({ ok: true, packs: [] })
  })
})
