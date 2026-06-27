export interface SeedExample { sentence: string; translationZh: string; source?: string }
export interface SeedWord {
  headword: string
  phonetic?: string
  partOfSpeech?: string
  definitionZh: string
  examTags?: string[]
  examples: SeedExample[]
}
export interface SeedBook {
  slug: string
  name: string
  description?: string
  level?: string
  words: SeedWord[]
}

function req(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`Invalid seed: ${msg}`)
}

function parseExample(raw: unknown, where: string): SeedExample {
  const e = raw as Record<string, unknown>
  req(typeof e?.sentence === 'string' && e.sentence.length > 0, `${where}.sentence must be a non-empty string`)
  req(typeof e?.translationZh === 'string' && e.translationZh.length > 0, `${where}.translationZh must be a non-empty string`)
  req(e.source === undefined || typeof e.source === 'string', `${where}.source must be a string if present`)
  return { sentence: e.sentence as string, translationZh: e.translationZh as string, source: e.source as string | undefined }
}

function parseWord(raw: unknown, i: number): SeedWord {
  const w = raw as Record<string, unknown>
  const where = `words[${i}]`
  req(typeof w?.headword === 'string' && w.headword.length > 0, `${where}.headword must be a non-empty string`)
  req(typeof w?.definitionZh === 'string' && w.definitionZh.length > 0, `${where}.definitionZh must be a non-empty string`)
  req(Array.isArray(w.examples) && w.examples.length > 0, `${where}.examples must be a non-empty array`)
  req(w.examTags === undefined || Array.isArray(w.examTags), `${where}.examTags must be an array if present`)
  return {
    headword: w.headword as string,
    phonetic: w.phonetic as string | undefined,
    partOfSpeech: w.partOfSpeech as string | undefined,
    definitionZh: w.definitionZh as string,
    examTags: (w.examTags as string[] | undefined) ?? [],
    examples: (w.examples as unknown[]).map((e, j) => parseExample(e, `${where}.examples[${j}]`)),
  }
}

export function parseSeedBook(raw: unknown): SeedBook {
  const b = raw as Record<string, unknown>
  req(typeof b?.slug === 'string' && b.slug.length > 0, 'slug must be a non-empty string')
  req(typeof b?.name === 'string' && b.name.length > 0, 'name must be a non-empty string')
  req(Array.isArray(b.words) && b.words.length > 0, 'words must be a non-empty array')
  return {
    slug: b.slug as string,
    name: b.name as string,
    description: b.description as string | undefined,
    level: b.level as string | undefined,
    words: (b.words as unknown[]).map(parseWord),
  }
}
