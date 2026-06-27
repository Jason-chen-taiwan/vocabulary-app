import { describe, it, expect, vi } from 'vitest'
import { BuiltinWordBookSource } from '@/lib/content/card-source'

describe('BuiltinWordBookSource', () => {
  it('id is namespaced by slug', () => {
    const src = new BuiltinWordBookSource('toeic-core', {} as any)
    expect(src.id).toBe('builtin:toeic-core')
  })

  it('listCards resolves the book by slug then returns its words with examples', async () => {
    const repo = {
      getWordBookBySlug: vi.fn().mockResolvedValue({ id: 'b1', slug: 'toeic-core', name: 'x', description: null, level: null, wordCount: 1 }),
      listWordsByBook: vi.fn().mockResolvedValue([{ id: 'w1', headword: 'invoice', phonetic: null, partOfSpeech: 'n.', definitionZh: '發票', examTags: [] }]),
      getWordWithExamples: vi.fn().mockResolvedValue({ id: 'w1', headword: 'invoice', phonetic: null, partOfSpeech: 'n.', definitionZh: '發票', examTags: [], examples: [{ id: 'e1', sentence: 'X.', translationZh: 'X。', source: null }] }),
    }
    const src = new BuiltinWordBookSource('toeic-core', repo as any)
    const cards = await src.listCards()
    expect(repo.getWordBookBySlug).toHaveBeenCalledWith('toeic-core')
    expect(repo.listWordsByBook).toHaveBeenCalledWith('b1')
    expect(cards).toHaveLength(1)
    expect(cards[0].examples[0].sentence).toBe('X.')
  })

  it('listCards returns [] when the book does not exist', async () => {
    const repo = { getWordBookBySlug: vi.fn().mockResolvedValue(null), listWordsByBook: vi.fn(), getWordWithExamples: vi.fn() }
    const src = new BuiltinWordBookSource('missing', repo as any)
    expect(await src.listCards()).toEqual([])
    expect(repo.listWordsByBook).not.toHaveBeenCalled()
  })
})
