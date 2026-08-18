import { describe, it, expect, vi } from 'vitest'
import { ContentRepository } from '@/lib/content/repository'

function makeDb() {
  return {
    wordBook: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
    word: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
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
      where: { sourceType: { not: 'notebook' } },
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

  it('listWordsWithExamplesByIds fetches by ids in one query and maps to WordWithExamples', async () => {
    const db = makeDb()
    db.word.findMany.mockResolvedValue([
      {
        id: 'w1', headword: 'invoice', phonetic: null, partOfSpeech: 'n.', definitionZh: '發票', examTags: ['TOEIC'],
        examples: [{ id: 'e1', sentence: 'X.', translationZh: 'X。', source: null }],
      },
    ])
    const repo = new ContentRepository(db as any)
    const result = await repo.listWordsWithExamplesByIds(['w1'])
    expect(db.word.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['w1'] } },
      include: { examples: { orderBy: { order: 'asc' } } },
    })
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('w1')
    expect(result[0].examples).toEqual([{ id: 'e1', sentence: 'X.', translationZh: 'X。', source: null }])
  })

  it('listWordsWithExamplesByIds returns [] immediately without calling findMany when ids is empty', async () => {
    const db = makeDb()
    const repo = new ContentRepository(db as any)
    const result = await repo.listWordsWithExamplesByIds([])
    expect(result).toEqual([])
    expect(db.word.findMany).not.toHaveBeenCalled()
  })

  it('getWordCore returns headword + definitionZh', async () => {
    const db = makeDb()
    db.word.findUnique.mockResolvedValue({ headword: 'invoice', definitionZh: '發票' })
    const repo = new ContentRepository(db as any)
    expect(await repo.getWordCore('w1')).toEqual({ headword: 'invoice', definitionZh: '發票' })
    expect(db.word.findUnique).toHaveBeenCalledWith({ where: { id: 'w1' }, select: { headword: true, definitionZh: true } })
  })
})

describe('notebook', () => {
  it('ensureNotebookBook：已存在回 id，不存在建立', async () => {
    const db = makeDb()
    db.wordBook.findUnique.mockResolvedValueOnce({ id: 'b1' })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const repo = new ContentRepository(db as any)
    expect(await repo.ensureNotebookBook()).toEqual({ id: 'b1' })

    db.wordBook.findUnique.mockResolvedValueOnce(null)
    db.wordBook.create.mockResolvedValueOnce({ id: 'b2' })
    expect(await repo.ensureNotebookBook()).toEqual({ id: 'b2' })
    expect(db.wordBook.create).toHaveBeenCalledWith({
      data: { slug: 'my-notebook', name: '我的生字本', sourceType: 'notebook', order: 99 },
      select: { id: true },
    })
  })

  it('upsertNotebookWord：同字冪等，不覆寫既有釋義', async () => {
    const db = makeDb()
    db.word.findUnique.mockResolvedValueOnce({ id: 'w1' })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const repo = new ContentRepository(db as any)
    expect(await repo.upsertNotebookWord('b1', { headword: 'zeal', definitionZh: '熱忱', partOfSpeech: 'n.' })).toEqual({ id: 'w1' })
    expect(db.word.create).not.toHaveBeenCalled()
  })

  it('listWordBooks 排除 notebook 書', async () => {
    const db = makeDb()
    db.wordBook.findMany.mockResolvedValue([])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await new ContentRepository(db as any).listWordBooks()
    expect(db.wordBook.findMany.mock.calls[0][0].where).toEqual({ sourceType: { not: 'notebook' } })
  })

  it('listCollectedWordsByBook 只取該使用者有卡的字', async () => {
    const db = makeDb()
    db.word.findMany.mockResolvedValue([])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await new ContentRepository(db as any).listCollectedWordsByBook('b1', 'u1')
    expect(db.word.findMany.mock.calls[0][0].where).toEqual({ wordBookId: 'b1', userCards: { some: { userId: 'u1' } } })
  })

  it('listAllDefinitions 排除 notebook 書的釋義（不進 MC 干擾項池）', async () => {
    const db = makeDb()
    db.word.findMany.mockResolvedValue([])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await new ContentRepository(db as any).listAllDefinitions()
    expect(db.word.findMany.mock.calls[0][0].where).toEqual({ wordBook: { sourceType: { not: 'notebook' } } })
  })

  it('listAllHeadwords 排除 notebook 書（sitemap 不收生字本）', async () => {
    const db = makeDb()
    db.word.findMany.mockResolvedValue([])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await new ContentRepository(db as any).listAllHeadwords()
    expect(db.word.findMany.mock.calls[0][0].where).toEqual({ wordBook: { sourceType: { not: 'notebook' } } })
  })

  it('getPublicWordByHeadword 排除 notebook 書（不進公開單字頁）', async () => {
    const db = makeDb()
    db.word.findMany.mockResolvedValue([])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await new ContentRepository(db as any).getPublicWordByHeadword('invoice')
    expect(db.word.findMany.mock.calls[0][0].where).toEqual({ headword: 'invoice', wordBook: { sourceType: { not: 'notebook' } } })
  })
})
