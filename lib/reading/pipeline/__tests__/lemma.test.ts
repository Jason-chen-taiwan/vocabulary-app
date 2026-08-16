import { describe, it, expect } from 'vitest'
import { parseLemmaFile, makeLemmaOf } from '@/lib/reading/pipeline/lemma'

const SAMPLE = [
  '; BNC lemma list',
  'run/1000 -> ran,running,runs',
  'study/500 -> studied,studies,studying',
].join('\n')

describe('lemma', () => {
  it('parseLemmaFile 建出 變形→lemma 對照，跳過註解行', () => {
    const map = parseLemmaFile(SAMPLE)
    expect(map.get('ran')).toBe('run')
    expect(map.get('studies')).toBe('study')
    expect(map.has(';')).toBe(false)
  })

  it('makeLemmaOf：小寫化查表，查無回小寫原詞', () => {
    const lemmaOf = makeLemmaOf(parseLemmaFile(SAMPLE))
    expect(lemmaOf('Ran')).toBe('run')
    expect(lemmaOf('Hello')).toBe('hello')
  })
})
