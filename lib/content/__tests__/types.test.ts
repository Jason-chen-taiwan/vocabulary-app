import { describe, it, expect } from 'vitest'
import { toWordWithExamples, toWordBookData } from '@/lib/content/types'

describe('toWordWithExamples', () => {
  it('maps a prisma word row (with examples) to the domain type', () => {
    const row = {
      id: 'w1', headword: 'invoice', phonetic: '/ˈɪnvɔɪs/', partOfSpeech: 'n.',
      definitionZh: '發票', examTags: ['TOEIC'],
      examples: [
        { id: 'e1', sentence: 'Send the invoice.', translationZh: '把發票寄出。', source: null, order: 0 },
      ],
      // extra prisma fields that must NOT leak through:
      wordBookId: 'b1', order: 0, createdAt: new Date(), updatedAt: new Date(),
    }
    expect(toWordWithExamples(row as any)).toEqual({
      id: 'w1', headword: 'invoice', phonetic: '/ˈɪnvɔɪs/', partOfSpeech: 'n.',
      definitionZh: '發票', examTags: ['TOEIC'],
      examples: [{ id: 'e1', sentence: 'Send the invoice.', translationZh: '把發票寄出。', source: null }],
    })
  })
})

describe('toWordBookData', () => {
  it('maps a book row with a word count', () => {
    const row = { id: 'b1', slug: 'toeic-core', name: '多益核心字彙', description: null, level: 'TOEIC', _count: { words: 12 } }
    expect(toWordBookData(row as any)).toEqual({
      id: 'b1', slug: 'toeic-core', name: '多益核心字彙', description: null, level: 'TOEIC', wordCount: 12,
    })
  })
})
