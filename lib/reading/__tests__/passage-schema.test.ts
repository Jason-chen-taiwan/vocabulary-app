import { describe, it, expect } from 'vitest'
import { parsePassageFile, isValidGloss } from '@/lib/reading/passage-schema'

function valid() {
  return {
    slug: 'office-memo-1',
    kind: 'toeic',
    title: 'Office Supply Reminder',
    titleZh: '辦公用品提醒',
    level: 'L1',
    topic: 'office',
    source: 'self-made',
    wordCount: 2,
    content: [[{ w: 'Please' , l: 'please' }, { w: ' ' }, { w: 'staple', l: 'staple' }, { w: '.' }]],
    glossary: { please: { zh: '請' }, staple: { zh: '裝訂', curated: true } },
    questions: [
      { id: 'q1', type: 'main', stem: 'What is the memo about?', options: ['A', 'B', 'C', 'D'], answer: 0 },
      { id: 'q2', type: 'detail', stem: 'Who should reply?', options: ['A', 'B', 'C', 'D'], answer: 2 },
      { id: 'q3', type: 'inference', stem: 'What will happen next?', options: ['A', 'B', 'C', 'D'], answer: 3 },
    ],
  }
}

describe('parsePassageFile', () => {
  it('接受合法 passage', () => {
    const p = parsePassageFile(valid())
    expect(p.slug).toBe('office-memo-1')
    expect(p.wordCount).toBe(2)
  })

  it('token 的 lemma 必須在 glossary 中（完整性）', () => {
    const p = valid()
    p.content = [[{ w: 'unknown', l: 'unknown' }]]
    p.wordCount = 1
    expect(() => parsePassageFile(p)).toThrow(/glossary/)
  })

  it('wordCount 必須等於帶 lemma 的 token 數', () => {
    const p = valid()
    p.wordCount = 99
    expect(() => parsePassageFile(p)).toThrow(/wordCount/)
  })

  it('toeic 題數必須 3–5；story 可為 0', () => {
    const p = valid()
    p.questions = p.questions.slice(0, 2)
    expect(() => parsePassageFile(p)).toThrow(/questions/)
    const s = valid()
    s.kind = 'story'
    s.questions = []
    expect(() => parsePassageFile(s)).not.toThrow()
  })

  it('每題恰 4 選項、answer 0–3、id 不重複', () => {
    const p = valid()
    p.questions[0].options = ['A', 'B', 'C']
    expect(() => parsePassageFile(p)).toThrow(/options/)
    const q = valid()
    q.questions[0].answer = 4
    expect(() => parsePassageFile(q)).toThrow(/answer/)
    const r = valid()
    r.questions[1].id = 'q1'
    expect(() => parsePassageFile(r)).toThrow(/id/)
  })

  it('glossary 釋義必須符合短對譯規則', () => {
    const p = valid()
    p.glossary.please = { zh: '這是一個非常長的解釋不是對譯' }
    expect(() => parsePassageFile(p)).toThrow(/gloss/)
  })

  it('source 必填', () => {
    const p = valid()
    p.source = ''
    expect(() => parsePassageFile(p)).toThrow(/source/)
  })
})

describe('isValidGloss', () => {
  it('每個「；」義項去全形括號後，第一個「，、」前 ≤6 字', () => {
    expect(isValidGloss('裝訂')).toBe(true)
    expect(isValidGloss('條款，合約中規範特定事項的條文')).toBe(true)
    expect(isValidGloss('放棄；拋棄')).toBe(true)
    expect(isValidGloss('（口語）好的，同意')).toBe(true)
    expect(isValidGloss('透過電話線傳送文件的機器')).toBe(false)
    expect(isValidGloss('')).toBe(false)
  })
})
