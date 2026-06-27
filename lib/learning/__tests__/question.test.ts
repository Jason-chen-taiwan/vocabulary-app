import { describe, it, expect } from 'vitest'
import { pickQuestionType, checkAnswer, sample, buildQuestion } from '@/lib/learning/question'

const word = {
  id: 'w1', headword: 'negotiate', phonetic: '/n/', partOfSpeech: 'v.', definitionZh: '談判，協商', examTags: ['TOEIC'],
  examples: [{ id: 'e1', sentence: 'We need to negotiate the terms.', translationZh: '我們需要協商條款。', source: null }],
}

describe('pickQuestionType', () => {
  it('maps streak to type by threshold', () => {
    expect([0, 1, 2, 3, 4, 9].map(pickQuestionType)).toEqual(['mc', 'mc', 'cloze', 'cloze', 'typing', 'typing'])
  })
})

describe('checkAnswer', () => {
  it('ignores case and surrounding whitespace', () => {
    expect(checkAnswer('  Negotiate ', 'negotiate')).toBe(true)
  })
  it('rejects misspelling', () => {
    expect(checkAnswer('negociate', 'negotiate')).toBe(false)
  })
})

describe('sample', () => {
  it('takes n items deterministically with an injected rng', () => {
    const rng = () => 0 // always picks index 0 of the remaining
    expect(sample(['a', 'b', 'c'], 2, rng)).toEqual(['a', 'b'])
  })
  it('caps at array length', () => {
    expect(sample(['a'], 3, () => 0)).toEqual(['a'])
  })
})

describe('buildQuestion', () => {
  it('mc: headword prompt, options include correct def + distractors, answer is the def', () => {
    const q = buildQuestion(word as any, 'mc', ['錯誤一', '錯誤二', '錯誤三'])
    expect(q.type).toBe('mc')
    expect(q.prompt).toBe('negotiate')
    expect(q.audioText).toBe('negotiate')
    expect(q.answer).toBe('談判，協商')
    expect(q.options).toEqual(['談判，協商', '錯誤一', '錯誤二', '錯誤三'])
  })
  it('cloze: blanks the headword in the example, hint is the translation, answer is headword', () => {
    const q = buildQuestion(word as any, 'cloze', [])
    expect(q.type).toBe('cloze')
    expect(q.prompt).toBe('We need to _____ the terms.')
    expect(q.hint).toBe('我們需要協商條款。')
    expect(q.options).toBeNull()
    expect(q.answer).toBe('negotiate')
  })
  it('typing: definition prompt, no options, answer is headword', () => {
    const q = buildQuestion(word as any, 'typing', [])
    expect(q.type).toBe('typing')
    expect(q.prompt).toBe('談判，協商')
    expect(q.options).toBeNull()
    expect(q.answer).toBe('negotiate')
  })
  it('cloze falls back to typing when no example contains the headword', () => {
    const noEx = { ...word, examples: [{ id: 'e', sentence: 'unrelated text', translationZh: 'x', source: null }] }
    const q = buildQuestion(noEx as any, 'cloze', [])
    expect(q.type).toBe('typing')
    expect(q.prompt).toBe('談判，協商')
  })
})
