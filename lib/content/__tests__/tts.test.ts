import { describe, it, expect } from 'vitest'
import { buildUtterance } from '@/lib/content/tts'

describe('buildUtterance', () => {
  it('defaults to en-US and a slightly slow rate', () => {
    expect(buildUtterance('invoice')).toEqual({ text: 'invoice', lang: 'en-US', rate: 0.9 })
  })
  it('accepts a custom lang', () => {
    expect(buildUtterance('hello', 'en-GB')).toEqual({ text: 'hello', lang: 'en-GB', rate: 0.9 })
  })
})
