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
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function typingQuestion(word: WordWithExamples): Question {
  return { wordId: word.id, type: 'typing', prompt: word.definitionZh, hint: null, audioText: null, options: null, answer: word.headword }
}

export function buildQuestion(word: WordWithExamples, type: QuestionType, distractorDefs: string[]): Question {
  if (type === 'mc') {
    return {
      wordId: word.id, type: 'mc', prompt: word.headword, hint: null, audioText: word.headword,
      options: [word.definitionZh, ...distractorDefs], answer: word.definitionZh,
    }
  }
  if (type === 'cloze') {
    const ex = word.examples[0]
    if (ex) {
      const re = new RegExp(`\\b${escapeRegExp(word.headword)}\\b`, 'i')
      if (re.test(ex.sentence)) {
        return {
          wordId: word.id, type: 'cloze', prompt: ex.sentence.replace(re, '_____'),
          hint: ex.translationZh, audioText: null, options: null, answer: word.headword,
        }
      }
    }
    return typingQuestion(word) // fallback when no usable example
  }
  return typingQuestion(word)
}
