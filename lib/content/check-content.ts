export interface CheckWord { headword: string; definitionZh: string; examples: { sentence: string }[] }
export interface CheckBook { slug: string; level?: string | null; words: CheckWord[] }

const MAX_SENTENCE = 90

/**
 * 重複字檢查以「同一考試內」為範圍：同一個字出現在雅思與多益是正常的
 * （學術字本來就跨考試），兩者的卡片 id 也不同（`<bookSlug>:<headword>`），
 * 排程互不干擾。同一考試內重複才是真的資料錯誤。
 */
function examOf(book: CheckBook): string {
  return book.level ?? book.slug.split('-')[0]
}

export function checkContent(books: CheckBook[]): string[] {
  const problems: string[] = []
  const seen = new Map<string, string>() // `${exam}:${headword}` -> slug
  for (const book of books) {
    const defs = new Map<string, string>() // definitionZh -> headword
    const exam = examOf(book)
    for (const w of book.words) {
      const key = `${exam}:${w.headword.toLowerCase()}`
      const prev = seen.get(key)
      if (prev) problems.push(`duplicate headword "${w.headword}" in ${book.slug} (also in ${prev})`)
      else seen.set(key, book.slug)

      const dprev = defs.get(w.definitionZh)
      if (dprev) problems.push(`duplicate definition "${w.definitionZh}" in ${book.slug} (${dprev} & ${w.headword})`)
      else defs.set(w.definitionZh, w.headword)

      if (!w.examples || w.examples.length === 0) problems.push(`no example for "${w.headword}" in ${book.slug}`)
      for (const e of w.examples ?? []) {
        if (e.sentence.length > MAX_SENTENCE) problems.push(`sentence too long for "${w.headword}" in ${book.slug} (${e.sentence.length})`)
      }
    }
  }
  return problems
}
