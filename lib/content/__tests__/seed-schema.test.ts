import { describe, it, expect } from 'vitest'
import { parseSeedBook } from '@/lib/content/seed-schema'

const valid = {
  slug: 'toeic-core', name: '多益核心字彙', level: 'TOEIC',
  words: [
    { headword: 'invoice', phonetic: '/ˈɪnvɔɪs/', partOfSpeech: 'n.', definitionZh: '發票', examTags: ['TOEIC'],
      examples: [{ sentence: 'Send the invoice.', translationZh: '把發票寄出。' }] },
  ],
}

describe('parseSeedBook', () => {
  it('accepts a valid book and defaults optional fields', () => {
    const book = parseSeedBook(valid)
    expect(book.slug).toBe('toeic-core')
    expect(book.words[0].examTags).toEqual(['TOEIC'])
    expect(book.words[0].examples[0].source).toBeUndefined()
  })

  it('throws when slug is missing', () => {
    expect(() => parseSeedBook({ ...valid, slug: '' })).toThrowError(/slug/)
  })

  it('throws when a word has no examples', () => {
    const bad = { ...valid, words: [{ headword: 'x', definitionZh: 'x', examples: [] }] }
    expect(() => parseSeedBook(bad)).toThrowError(/examples/)
  })

  it('throws when a word is missing definitionZh', () => {
    const bad = { ...valid, words: [{ headword: 'x', examples: [{ sentence: 'a', translationZh: 'b' }] }] }
    expect(() => parseSeedBook(bad)).toThrowError(/definitionZh/)
  })
})
