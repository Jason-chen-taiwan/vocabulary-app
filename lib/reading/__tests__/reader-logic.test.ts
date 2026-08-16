import { describe, it, expect } from 'vitest'
import { wpm, readSecondsBetween } from '@/lib/reading/reader-logic'

describe('reader-logic', () => {
  it('wpm：wordCount / 分鐘，四捨五入', () => {
    expect(wpm(150, 60)).toBe(150)
    expect(wpm(100, 90)).toBe(67)
  })
  it('wpm：無計時或 <10 秒回 null（避免灌水數字）', () => {
    expect(wpm(150, null)).toBeNull()
    expect(wpm(150, 5)).toBeNull()
  })
  it('readSecondsBetween：向下取整秒、負值歸零', () => {
    expect(readSecondsBetween(1000, 62500)).toBe(61)
    expect(readSecondsBetween(5000, 1000)).toBe(0)
  })
})
