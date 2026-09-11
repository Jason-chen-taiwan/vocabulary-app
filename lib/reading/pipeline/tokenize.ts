import type { PassageToken } from '../types'

const WORD_RE = /[A-Za-z]+(?:['’-][A-Za-z]+)*/g

// 把一段原文切成 token 串：英文字帶 lemma，其餘（標點、空白）原樣保留，串回可還原原文
export function tokenize(paragraph: string, lemmaOf: (word: string) => string): PassageToken[] {
  const out: PassageToken[] = []
  let last = 0
  for (const m of paragraph.matchAll(WORD_RE)) {
    const start = m.index ?? 0
    if (start > last) out.push({ w: paragraph.slice(last, start) })
    out.push({ w: m[0], l: lemmaOf(m[0]) })
    last = start + m[0].length
  }
  if (last < paragraph.length) out.push({ w: paragraph.slice(last) })
  return out
}
