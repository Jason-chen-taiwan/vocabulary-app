import type { WordWithExamples } from '@/lib/content/types'

export type QuestionType = 'mc' | 'cloze' | 'typing'

export function pickQuestionType(streak: number): QuestionType {
  if (streak <= 1) return 'mc'
  if (streak <= 3) return 'cloze'
  return 'typing'
}

export function checkAnswer(input: string, expected: string): boolean {
  return input.trim().toLowerCase() === expected.trim().toLowerCase()
}

// 由字串種子產生確定性 PRNG（xmur3 種子 + mulberry32）。
// 用於需要「SSR 與 client 一致」的洗牌（如 MC 選項順序），避免 hydration 不匹配。
export function seededRng(seed: string): () => number {
  let h = 1779033703 ^ seed.length
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  let a = h >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function sample<T>(arr: T[], n: number, rng: () => number = Math.random): T[] {
  const pool = [...arr]
  const out: T[] = []
  const count = Math.min(n, pool.length)
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(rng() * pool.length)
    out.push(pool.splice(idx, 1)[0])
  }
  return out
}

export interface Question {
  wordId: string
  type: QuestionType
  prompt: string
  hint: string | null
  audioText: string | null
  options: string[] | null
  answer: string
  // 首字母提示 + 其餘每字一格底線，長度對齊答案（如 apple → "a ▁ ▁ ▁ ▁"）。mc 為 null。
  masked: string | null
}

// 首字母顯示，其餘字母以底線佔位；非字母（空格、連字號）原樣保留位置。
export function maskWord(word: string): string {
  const chars = [...word]
  return chars
    .map((c, i) => (i === 0 ? c : /[a-zA-Z]/.test(c) ? '▁' : c))
    .join(' ')
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function typingQuestion(word: WordWithExamples): Question {
  return { wordId: word.id, type: 'typing', prompt: word.definitionZh, hint: null, audioText: null, options: null, answer: word.headword, masked: maskWord(word.headword) }
}

export function buildQuestion(word: WordWithExamples, type: QuestionType, distractorDefs: string[]): Question {
  if (type === 'mc') {
    return {
      wordId: word.id, type: 'mc', prompt: word.headword, hint: null, audioText: word.headword,
      options: [word.definitionZh, ...distractorDefs], answer: word.definitionZh, masked: null,
    }
  }
  if (type === 'cloze') {
    const ex = word.examples[0]
    if (ex) {
      const re = new RegExp(`\\b${escapeRegExp(word.headword)}\\b`, 'i')
      if (re.test(ex.sentence)) {
        return {
          wordId: word.id, type: 'cloze', prompt: ex.sentence.replace(re, '(？)'),
          hint: ex.translationZh, audioText: null, options: null, answer: word.headword,
          masked: maskWord(word.headword),
        }
      }
    }
    return typingQuestion(word) // fallback when no usable example
  }
  return typingQuestion(word)
}
