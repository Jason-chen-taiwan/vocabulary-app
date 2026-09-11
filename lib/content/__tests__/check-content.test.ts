import { describe, it, expect } from 'vitest'
import { checkContent } from '@/lib/content/check-content'

const ex = [{ sentence: 'A short sentence.' }]
describe('checkContent', () => {
  it('passes clean books', () => {
    expect(checkContent([
      { slug: 'a', words: [{ headword: 'alpha', definitionZh: '甲', examples: ex }] },
      { slug: 'b', words: [{ headword: 'beta', definitionZh: '乙', examples: ex }] },
    ])).toEqual([])
  })
  it('flags cross-book duplicate headword within one exam (case-insensitive)', () => {
    const out = checkContent([
      { slug: 'a', level: 'IELTS', words: [{ headword: 'Alpha', definitionZh: '甲', examples: ex }] },
      { slug: 'b', level: 'IELTS', words: [{ headword: 'alpha', definitionZh: '乙', examples: ex }] },
    ])
    expect(out.join()).toMatch(/duplicate headword.*alpha/i)
  })
  it('flags duplicate definitionZh within a book', () => {
    const out = checkContent([
      { slug: 'a', words: [
        { headword: 'alpha', definitionZh: '相同', examples: ex },
        { headword: 'beta', definitionZh: '相同', examples: ex },
      ] },
    ])
    expect(out.join()).toMatch(/duplicate definition/i)
  })
  it('flags missing example', () => {
    expect(checkContent([{ slug: 'a', words: [{ headword: 'alpha', definitionZh: '甲', examples: [] }] }]).join())
      .toMatch(/no example/i)
  })
  it('flags overlong sentence', () => {
    const long = 'x'.repeat(91)
    expect(checkContent([{ slug: 'a', words: [{ headword: 'alpha', definitionZh: '甲', examples: [{ sentence: long }] }] }]).join())
      .toMatch(/too long/i)
  })
})

describe('cross-exam headwords', () => {
  const word = (headword: string, definitionZh: string) => ({
    headword, definitionZh, examples: [{ sentence: 'A short example sentence.' }],
  })

  it('allows the same headword in different exams', () => {
    const problems = checkContent([
      { slug: 'ielts-awl-1', level: 'IELTS', words: [word('role', '角色')] },
      { slug: 'toeic-tech', level: 'TOEIC', words: [word('role', '職責')] },
    ])
    expect(problems).toEqual([])
  })

  it('still flags a duplicate headword within the same exam', () => {
    const problems = checkContent([
      { slug: 'ielts-awl-1', level: 'IELTS', words: [word('role', '角色')] },
      { slug: 'ielts-awl-2', level: 'IELTS', words: [word('role', '職責')] },
    ])
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('duplicate headword "role"')
  })
})
