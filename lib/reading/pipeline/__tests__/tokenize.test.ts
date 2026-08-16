import { describe, it, expect } from 'vitest'
import { tokenize } from '@/lib/reading/pipeline/tokenize'

const lower = (w: string) => w.toLowerCase()

describe('tokenize', () => {
  it('英文字帶 lemma，標點與空白原樣保留', () => {
    expect(tokenize('He ran fast.', lower)).toEqual([
      { w: 'He', l: 'he' }, { w: ' ' }, { w: 'ran', l: 'ran' }, { w: ' ' }, { w: 'fast', l: 'fast' }, { w: '.' },
    ])
  })

  it('縮寫與連字號視為一個字', () => {
    expect(tokenize("Don't re-enter", lower)).toEqual([
      { w: "Don't", l: "don't" }, { w: ' ' }, { w: 're-enter', l: 're-enter' },
    ])
  })

  it('串回原文不失真', () => {
    const src = 'Hello, world! (See attached: Q3-report.)'
    const joined = tokenize(src, lower).map((t) => t.w).join('')
    expect(joined).toBe(src)
  })
})
