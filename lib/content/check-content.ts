export interface CheckWord { headword: string; definitionZh: string; examples: { sentence: string }[] }
export interface CheckBook { slug: string; words: CheckWord[] }

const MAX_SENTENCE = 90

export function checkContent(books: CheckBook[]): string[] {
  const problems: string[] = []
  const seen = new Map<string, string>() // headword(lower) -> slug
  for (const book of books) {
    const defs = new Map<string, string>() // definitionZh -> headword
    for (const w of book.words) {
      const key = w.headword.toLowerCase()
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
