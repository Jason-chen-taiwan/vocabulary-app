import type { GlossEntry, PassageFile, PassageQuestion, PassageToken } from './types.ts'

function req(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`Invalid passage: ${msg}`)
}

const KINDS = ['toeic', 'story']
const QUESTION_TYPES = ['main', 'detail', 'inference']

// CLAUDE.md 內容格式慣例的機器驗證：去全形括號後，每個「；」義項第一個「，、」前 ≤6 字
export function isValidGloss(zh: string): boolean {
  if (!zh.trim()) return false
  return zh.split('；').every((sense) => {
    const stripped = sense.replace(/（[^）]*）/g, '').replace(/\([^)]*\)/g, '')
    const first = stripped.split(/[，、]/)[0].trim()
    return first.length > 0 && first.length <= 6
  })
}

function parseToken(raw: unknown, where: string): PassageToken {
  const t = raw as Record<string, unknown>
  req(typeof t === 'object' && t !== null, `${where} 不是物件`)
  req(typeof t.w === 'string' && t.w.length > 0, `${where}.w 必填`)
  if (t.l === undefined) return { w: t.w as string }
  req(typeof t.l === 'string' && (t.l as string).length > 0, `${where}.l 需為非空字串`)
  return { w: t.w as string, l: t.l as string }
}

function parseQuestion(raw: unknown, i: number): PassageQuestion {
  const q = raw as Record<string, unknown>
  req(typeof q === 'object' && q !== null, `questions[${i}] 不是物件`)
  req(typeof q.id === 'string' && q.id.length > 0, `questions[${i}].id 必填`)
  req(typeof q.type === 'string' && QUESTION_TYPES.includes(q.type as string), `questions[${i}].type 非法`)
  req(typeof q.stem === 'string' && (q.stem as string).trim().length > 0, `questions[${i}].stem 必填`)
  const options = q.options
  req(Array.isArray(options) && options.length === 4 && options.every((o) => typeof o === 'string' && o.trim().length > 0), `questions[${i}].options 需恰 4 個非空字串`)
  req(typeof q.answer === 'number' && Number.isInteger(q.answer) && (q.answer as number) >= 0 && (q.answer as number) <= 3, `questions[${i}].answer 需為 0–3 整數`)
  return { id: q.id as string, type: q.type as PassageQuestion['type'], stem: q.stem as string, options: options as string[], answer: q.answer as number }
}

export function parsePassageFile(raw: unknown): PassageFile {
  const p = raw as Record<string, unknown>
  req(typeof p === 'object' && p !== null, '不是物件')
  req(typeof p.slug === 'string' && /^[a-z0-9-]+$/.test(p.slug as string), 'slug 需為 kebab-case')
  req(typeof p.kind === 'string' && KINDS.includes(p.kind as string), 'kind 需為 toeic|story')
  req(typeof p.title === 'string' && (p.title as string).trim().length > 0, 'title 必填')
  req(typeof p.source === 'string' && (p.source as string).trim().length > 0, 'source 必填（出處與版權聲明）')

  req(Array.isArray(p.content) && (p.content as unknown[]).length > 0, 'content 需為非空段落陣列')
  const content = (p.content as unknown[]).map((para, pi) => {
    req(Array.isArray(para) && para.length > 0, `content[${pi}] 需為非空 token 陣列`)
    return (para as unknown[]).map((t, ti) => parseToken(t, `content[${pi}][${ti}]`))
  })

  req(typeof p.glossary === 'object' && p.glossary !== null && !Array.isArray(p.glossary), 'glossary 需為物件')
  const glossary: Record<string, GlossEntry> = {}
  for (const [lemma, entry] of Object.entries(p.glossary as Record<string, unknown>)) {
    const e = entry as Record<string, unknown>
    req(typeof e === 'object' && e !== null && typeof e.zh === 'string', `glossary["${lemma}"].zh 必填`)
    req(isValidGloss(e.zh as string), `glossary["${lemma}"] gloss 不符短對譯規則：「${e.zh}」`)
    glossary[lemma] = { zh: e.zh as string }
    if (typeof e.pos === 'string') glossary[lemma].pos = e.pos
    if (typeof e.wordId === 'string') glossary[lemma].wordId = e.wordId
    if (e.curated === true) glossary[lemma].curated = true
  }

  // 完整性：每個可點 token 的 lemma 都查得到 glossary
  let lemmaTokens = 0
  for (const para of content) for (const t of para) {
    if (t.l !== undefined) {
      lemmaTokens += 1
      req(glossary[t.l] !== undefined, `token "${t.w}" 的 lemma "${t.l}" 不在 glossary`)
    }
  }
  req(typeof p.wordCount === 'number' && p.wordCount === lemmaTokens, `wordCount(${p.wordCount}) 必須等於帶 lemma 的 token 數(${lemmaTokens})`)

  req(Array.isArray(p.questions), 'questions 需為陣列')
  const questions = (p.questions as unknown[]).map(parseQuestion)
  const ids = new Set(questions.map((q) => q.id))
  req(ids.size === questions.length, 'questions id 不可重複')
  if (p.kind === 'toeic') req(questions.length >= 3 && questions.length <= 5, 'toeic 篇 questions 需 3–5 題')
  else req(questions.length <= 5, 'story 篇 questions 需 0–5 題')

  const out: PassageFile = {
    slug: p.slug as string, kind: p.kind as PassageFile['kind'], title: p.title as string,
    source: p.source as string, wordCount: p.wordCount as number, content, glossary, questions,
  }
  if (typeof p.titleZh === 'string' && p.titleZh) out.titleZh = p.titleZh
  if (typeof p.level === 'string' && p.level) out.level = p.level
  if (typeof p.topic === 'string' && p.topic) out.topic = p.topic
  return out
}
