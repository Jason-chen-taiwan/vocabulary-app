import { describe, it, expect, vi } from 'vitest'
import { ContentRepository } from '@/lib/content/repository'

function makeDb() {
  return {
    wordBook: { findMany: vi.fn(), findUnique: vi.fn() },
    word: { findMany: vi.fn(), findUnique: vi.fn() },
  }
}

describe('ContentRepository', () => {
  it('listWordBooks orders by order asc and includes word count', async () => {
    const db = makeDb()
    db.wordBook.findMany.mockResolvedValue([
      { id: 'b1', slug: 'toeic-core', name: '多益核心字彙', description: null, level: 'TOEIC', _count: { words: 2 } },
    ])
    const repo = new ContentRepository(db as any)
    const result = await repo.listWordBooks()
    expect(db.wordBook.findMany).toHaveBeenCalledWith({
      orderBy: { order: 'asc' },
      include: { _count: { select: { words: true } } },
    })
    expect(result).toEqual([
      { id: 'b1', slug: 'toeic-core', name: '多益核心字彙', description: null, level: 'TOEIC', wordCount: 2 },
    ])
  })

  it('getWordBookBySlug returns null when not found', async () => {
    const db = makeDb()
    db.wordBook.findUnique.mockResolvedValue(null)
    const repo = new ContentRepository(db as any)
    expect(await repo.getWordBookBySlug('missing')).toBeNull()
    expect(db.wordBook.findUnique).toHaveBeenCalledWith({
      where: { slug: 'missing' },
      include: { _count: { select: { words: true } } },
    })
  })

  it('listWordsByBook maps rows to WordData ordered by order asc', async () => {
    const db = makeDb()
    db.word.findMany.mockResolvedValue([
      { id: 'w1', headword: 'invoice', phonetic: null, partOfSpeech: 'n.', definitionZh: '發票', examTags: ['TOEIC'] },
    ])
    const repo = new ContentRepository(db as any)
    const result = await repo.listWordsByBook('b1')
    expect(db.word.findMany).toHaveBeenCalledWith({ where: { wordBookId: 'b1' }, orderBy: { order: 'asc' } })
    expect(result).toEqual([
      { id: 'w1', headword: 'invoice', phonetic: null, partOfSpeech: 'n.', definitionZh: '發票', examTags: ['TOEIC'] },
    ])
  })

  it('listWordsByBookWithExamples fetches words+examples in one query and maps to WordWithExamples', async () => {
    const db = makeDb()
    db.word.findMany.mockResolvedValue([
      {
        id: 'w1', headword: 'invoice', phonetic: null, partOfSpeech: 'n.', definitionZh: '發票', examTags: ['TOEIC'],
        examples: [{ id: 'e1', sentence: 'X.', translationZh: 'X。', source: null }],
      },
    ])
    const repo = new ContentRepository(db as any)
    const result = await repo.listWordsByBookWithExamples('b1')
    expect(db.word.findMany).toHaveBeenCalledWith({
      where: { wordBookId: 'b1' },
      orderBy: { order: 'asc' },
      include: { examples: { orderBy: { order: 'asc' } } },
    })
    expect(result).toHaveLength(1)
    expect(result[0].examples).toEqual([{ id: 'e1', sentence: 'X.', translationZh: 'X。', source: null }])
  })

  it('getWordWithExamples includes examples ordered by order asc', async () => {
    const db = makeDb()
    db.word.findUnique.mockResolvedValue({
      id: 'w1', headword: 'invoice', phonetic: null, partOfSpeech: 'n.', definitionZh: '發票', examTags: [],
      examples: [{ id: 'e1', sentence: 'X.', translationZh: 'X。', source: null }],
    })
    const repo = new ContentRepository(db as any)
    const result = await repo.getWordWithExamples('w1')
    expect(db.word.findUnique).toHaveBeenCalledWith({
      where: { id: 'w1' },
      include: { examples: { orderBy: { order: 'asc' } } },
    })
    expect(result?.examples).toEqual([{ id: 'e1', sentence: 'X.', translationZh: 'X。', source: null }])
  })
})
