import { describe, it, expect } from 'vitest'
import { buildPassage, parsePassageSrc } from '@/lib/reading/pipeline/build'

const SRC = {
  slug: 'memo-1', kind: 'toeic', title: 'Memo', titleZh: '備忘錄', level: 'L1', topic: 'office', source: 'self-made',
  paragraphs: ['He ran fast.'],
  questions: [
    { type: 'main', stem: 'Q1?', options: ['A', 'B', 'C', 'D'], answer: 0 },
    { type: 'detail', stem: 'Q2?', options: ['A', 'B', 'C', 'D'], answer: 1 },
    { type: 'inference', stem: 'Q3?', options: ['A', 'B', 'C', 'D'], answer: 2 },
  ],
}

const DICT: Record<string, { zh: string; pos?: string }> = {
  he: { zh: '他' }, run: { zh: '跑', pos: 'v.' }, fast: { zh: '快', pos: 'adj.' },
}

function deps(curated: string[] = []) {
  return {
    lemmaOf: (w: string) => (w.toLowerCase() === 'ran' ? 'run' : w.toLowerCase()),
    lookup: (lemma: string) => DICT[lemma] ?? null,
    curated: new Set(curated),
  }
}

describe('buildPassage', () => {
  it('組出通過 parsePassageFile 的 PassageFile；question id 自動編號', () => {
    const p = buildPassage(parsePassageSrc(SRC), deps())
    expect(p.wordCount).toBe(3)
    expect(p.glossary.run).toEqual({ zh: '跑', pos: 'v.' })
    expect(p.questions.map((q) => q.id)).toEqual(['memo-1-q1', 'memo-1-q2', 'memo-1-q3'])
  })

  it('curated 字標 curated: true', () => {
    const p = buildPassage(parsePassageSrc(SRC), deps(['run']))
    expect(p.glossary.run.curated).toBe(true)
  })

  it('查無釋義時 throw 並列出全部缺字', () => {
    const src = parsePassageSrc({ ...SRC, paragraphs: ['He zzz qqq.'] })
    expect(() => buildPassage(src, deps())).toThrow(/zzz[\s\S]*qqq|qqq[\s\S]*zzz/)
  })
})
