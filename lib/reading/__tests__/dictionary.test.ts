import { describe, it, expect } from 'vitest'
import { GlossaryDictionary } from '@/lib/reading/dictionary'
import type { DictionaryService } from '@/lib/reading/dictionary'

const passage = { glossary: { run: { zh: '跑', pos: 'v.', wordId: 'w1' }, zeal: { zh: '熱忱' } } }

const implementations: [string, DictionaryService][] = [
  ['GlossaryDictionary', new GlossaryDictionary()],
]

describe.each(implementations)('DictionaryService 契約：%s', (_name, dict) => {
  it('查得到：回 lemma 與釋義，有 wordId/pos 就帶上', () => {
    expect(dict.lookup('run', passage)).toEqual({ lemma: 'run', zh: '跑', pos: 'v.', wordId: 'w1' })
    expect(dict.lookup('zeal', passage)).toEqual({ lemma: 'zeal', zh: '熱忱' })
  })
  it('查無回 null', () => {
    expect(dict.lookup('nope', passage)).toBeNull()
  })
})
