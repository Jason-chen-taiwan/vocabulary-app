import type { PassageData } from './types.ts'

export interface DictEntry { lemma: string; zh: string; pos?: string; wordId?: string }

// 查詞隔離點（spec §4）：本輪 = 查 passage glossary；未來「自貼文章」換全字典實作，上層不動
export interface DictionaryService {
  lookup(lemma: string, passage: Pick<PassageData, 'glossary'>): DictEntry | null
}

export class GlossaryDictionary implements DictionaryService {
  lookup(lemma: string, passage: Pick<PassageData, 'glossary'>): DictEntry | null {
    const e = passage.glossary[lemma]
    if (!e) return null
    const out: DictEntry = { lemma, zh: e.zh }
    if (e.pos) out.pos = e.pos
    if (e.wordId) out.wordId = e.wordId
    return out
  }
}
