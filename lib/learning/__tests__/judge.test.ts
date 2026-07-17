import { describe, it, expect } from 'vitest'
import { judgeAnswer } from '../judge'

const word = { headword: 'invoice', definitionZh: '發票；請款單' }

describe('judgeAnswer', () => {
  it('mc 全字串比對 definitionZh', () => {
    expect(judgeAnswer(word, 'mc', '發票；請款單')).toBe(true)
    expect(judgeAnswer(word, 'mc', '發票')).toBe(false)
  })
  it('cloze/typing 比對 headword（不分大小寫、修剪空白）', () => {
    expect(judgeAnswer(word, 'cloze', ' Invoice ')).toBe(true)
    expect(judgeAnswer(word, 'typing', 'invoise')).toBe(false)
  })
  it('空作答一律判錯', () => {
    expect(judgeAnswer(word, 'mc', '')).toBe(false)
    expect(judgeAnswer(word, 'typing', '')).toBe(false)
  })
})
