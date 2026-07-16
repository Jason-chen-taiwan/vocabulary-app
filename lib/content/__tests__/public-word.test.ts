import { describe, it, expect, vi } from 'vitest'
import { mergePublicWordRows } from '@/lib/content/public-word'
import { ContentRepository } from '@/lib/content/repository'

function makeDb() {
  return {
    wordBook: { findMany: vi.fn(), findUnique: vi.fn() },
    word: { findMany: vi.fn(), findUnique: vi.fn() },
  }
}

const rowA = {
  id: 'w1', headword: 'invoice', phonetic: '/ˈɪnvɔɪs/', partOfSpeech: 'n.',
  definitionZh: '發票', examTags: ['TOEIC'],
  examples: [{ id: 'e1', sentence: 'Send the invoice.', translationZh: '寄出發票。', source: null }],
  wordBook: { slug: 'toeic-finance', name: '財務金融' },
}
const rowB = {
  id: 'w2', headword: 'Invoice', phonetic: null, partOfSpeech: 'v.',
  definitionZh: '開發票', examTags: ['TOEIC'],
  examples: [
    { id: 'e2', sentence: 'Send the invoice.', translationZh: '寄出發票。', source: null }, // 與 e1 句子重複
    { id: 'e3', sentence: 'We invoice monthly.', translationZh: '我們按月開發票。', source: null },
  ],
  wordBook: { slug: 'toeic-office', name: '辦公室' },
}

describe('mergePublicWordRows', () => {
  it('空陣列回 null', () => {
    expect(mergePublicWordRows([])).toBeNull()
  })

  it('單筆直接映射，headword 正規化為小寫', () => {
    const w = mergePublicWordRows([{ ...rowA, headword: 'Invoice' }])
    expect(w).toMatchObject({ headword: 'invoice', phonetic: '/ˈɪnvɔɪs/', partOfSpeech: 'n.', definitionZh: '發票' })
    expect(w?.books).toEqual([{ slug: 'toeic-finance', name: '財務金融' }])
  })

  it('多書合併：欄位取首筆、例句依句子去重聯集、books 依 slug 去重', () => {
    const w = mergePublicWordRows([rowA, rowB])
    expect(w?.definitionZh).toBe('發票')
    expect(w?.partOfSpeech).toBe('n.')
    expect(w?.examples.map((e) => e.id)).toEqual(['e1', 'e3'])
    expect(w?.books).toEqual([
      { slug: 'toeic-finance', name: '財務金融' },
      { slug: 'toeic-office', name: '辦公室' },
    ])
  })

  it('首筆欄位為 null 時向後補值', () => {
    const w = mergePublicWordRows([{ ...rowA, phonetic: null }, rowB])
    expect(w?.phonetic).toBeNull() // rowB.phonetic 也是 null
    const w2 = mergePublicWordRows([{ ...rowB, id: 'x' }, rowA])
    expect(w2?.phonetic).toBe('/ˈɪnvɔɪs/') // 首筆 null，取後筆的音標
  })
})

describe('ContentRepository 公開查詢', () => {
  it('getPublicWordByHeadword 正規化輸入並查詢', async () => {
    const db = makeDb()
    db.word.findMany.mockResolvedValue([rowA])
    const repo = new ContentRepository(db as any)
    const w = await repo.getPublicWordByHeadword('  Invoice ')
    expect(db.word.findMany).toHaveBeenCalledWith({
      where: { headword: 'invoice' },
      orderBy: [{ wordBook: { slug: 'asc' } }, { id: 'asc' }],
      include: {
        examples: { orderBy: { order: 'asc' } },
        wordBook: { select: { slug: true, name: true } },
      },
    })
    expect(w?.headword).toBe('invoice')
  })

  it('getPublicWordByHeadword 空字串不打 DB、直接 null', async () => {
    const db = makeDb()
    const repo = new ContentRepository(db as any)
    expect(await repo.getPublicWordByHeadword('   ')).toBeNull()
    expect(db.word.findMany).not.toHaveBeenCalled()
  })

  it('getPublicWordByHeadword 查無回 null', async () => {
    const db = makeDb()
    db.word.findMany.mockResolvedValue([])
    const repo = new ContentRepository(db as any)
    expect(await repo.getPublicWordByHeadword('missing')).toBeNull()
  })

  it('listAllHeadwords 小寫去重排序', async () => {
    const db = makeDb()
    db.word.findMany.mockResolvedValue([
      { headword: 'Budget' }, { headword: 'audit' }, { headword: 'budget' },
    ])
    const repo = new ContentRepository(db as any)
    expect(await repo.listAllHeadwords()).toEqual(['audit', 'budget'])
    expect(db.word.findMany).toHaveBeenCalledWith({
      select: { headword: true },
      distinct: ['headword'],
      orderBy: { headword: 'asc' },
    })
  })
})
