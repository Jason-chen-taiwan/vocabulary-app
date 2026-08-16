import type { GlossEntry, PassageFile } from '../types.ts'
import { parsePassageFile } from '../passage-schema.ts'
import { tokenize } from './tokenize.ts'

export interface PassageSrcQuestion { type: string; stem: string; options: string[]; answer: number }
export interface PassageSrc {
  slug: string; kind: string; title: string; titleZh?: string; level?: string; topic?: string; source: string
  paragraphs: string[]
  questions: PassageSrcQuestion[]
}

function req(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`Invalid passage src: ${msg}`)
}

export function parsePassageSrc(raw: unknown): PassageSrc {
  const p = raw as Record<string, unknown>
  req(typeof p === 'object' && p !== null, '不是物件')
  req(typeof p.slug === 'string' && (p.slug as string).length > 0, 'slug 必填')
  req(typeof p.kind === 'string', 'kind 必填')
  req(typeof p.title === 'string', 'title 必填')
  req(typeof p.source === 'string' && (p.source as string).length > 0, 'source 必填')
  req(Array.isArray(p.paragraphs) && (p.paragraphs as unknown[]).every((s) => typeof s === 'string' && s.trim().length > 0), 'paragraphs 需為非空字串陣列')
  req(Array.isArray(p.questions), 'questions 需為陣列')
  return p as unknown as PassageSrc
}

export interface BuildDeps {
  lemmaOf(word: string): string
  lookup(lemma: string): { zh: string; pos?: string } | null
  curated: Set<string>
}

// 組裝＋驗證：產物一定通過 parsePassageFile（缺釋義在建置期整批報錯）
export function buildPassage(src: PassageSrc, deps: BuildDeps): PassageFile {
  const content = src.paragraphs.map((para) => tokenize(para, deps.lemmaOf))
  const glossary: Record<string, GlossEntry> = {}
  const missing: string[] = []
  let wordCount = 0
  for (const para of content) for (const t of para) {
    if (t.l === undefined) continue
    wordCount += 1
    if (glossary[t.l]) continue
    const entry = deps.lookup(t.l)
    if (!entry) { if (!missing.includes(t.l)) missing.push(t.l); continue }
    glossary[t.l] = { zh: entry.zh }
    if (entry.pos) glossary[t.l].pos = entry.pos
    if (deps.curated.has(t.l)) glossary[t.l].curated = true
  }
  if (missing.length) throw new Error(`查無釋義（請補 content/passages-src/_gloss-overrides.json）：\n${missing.join('\n')}`)

  const questions = src.questions.map((q, i) => ({ id: `${src.slug}-q${i + 1}`, type: q.type, stem: q.stem, options: q.options, answer: q.answer }))
  const file: Record<string, unknown> = {
    slug: src.slug, kind: src.kind, title: src.title, source: src.source, wordCount, content, glossary, questions,
  }
  if (src.titleZh) file.titleZh = src.titleZh
  if (src.level) file.level = src.level
  if (src.topic) file.topic = src.topic
  return parsePassageFile(file) // 最終驗證（含 gloss 格式、題數、完整性）
}
