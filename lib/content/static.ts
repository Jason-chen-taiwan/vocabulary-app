import type { WordBookData, WordWithExamples } from './types'

// 靜態內容來源：直接 import JSON，build 時打包進 bundle，runtime 零 DB、零 API。
// 取代原先的 ContentRepository（Prisma/Neon）——介面保持相同形狀，上層不需要知道差別。
import toeicBanking from '@/content/toeic-banking.json'
import toeicContracts from '@/content/toeic-contracts.json'
import toeicFinance from '@/content/toeic-finance.json'
import toeicHr from '@/content/toeic-hr.json'
import toeicLogistics from '@/content/toeic-logistics.json'
import toeicMarketing from '@/content/toeic-marketing.json'
import toeicMeetings from '@/content/toeic-meetings.json'
import toeicOffice from '@/content/toeic-office.json'
import toeicSafety from '@/content/toeic-safety.json'
import toeicService from '@/content/toeic-service.json'
import toeicTech from '@/content/toeic-tech.json'
import toeicTravel from '@/content/toeic-travel.json'
import ieltsAwl1 from '@/content/ielts-awl-1.json'
import ieltsAwl2 from '@/content/ielts-awl-2.json'
import ieltsAwl3 from '@/content/ielts-awl-3.json'
import ieltsAwl4 from '@/content/ielts-awl-4.json'
import ieltsAwl5 from '@/content/ielts-awl-5.json'
import ieltsAwl6 from '@/content/ielts-awl-6.json'
import ieltsAwl7 from '@/content/ielts-awl-7.json'
import ieltsAwl8 from '@/content/ielts-awl-8.json'
import ieltsAwl9 from '@/content/ielts-awl-9.json'
import ieltsAwl10 from '@/content/ielts-awl-10.json'

/** JSON 檔的原始形狀（無 id——id 在載入時由 slug + headword 衍生）。 */
interface RawExample {
  sentence: string
  translationZh: string
}
interface RawWord {
  headword: string
  phonetic?: string | null
  partOfSpeech?: string | null
  definitionZh: string
  examTags?: string[]
  examples?: RawExample[]
}
interface RawBook {
  slug: string
  name: string
  description?: string | null
  level?: string | null
  words: RawWord[]
}

// 雅思在前（本輪的主要目標），多益保留在後。
const RAW_BOOKS: RawBook[] = [
  ieltsAwl1, ieltsAwl2, ieltsAwl3, ieltsAwl4, ieltsAwl5,
  ieltsAwl6, ieltsAwl7, ieltsAwl8, ieltsAwl9, ieltsAwl10,
  toeicOffice, toeicMeetings, toeicHr, toeicFinance, toeicBanking,
  toeicContracts, toeicLogistics, toeicMarketing, toeicSafety,
  toeicService, toeicTech, toeicTravel,
] as RawBook[]

/**
 * 穩定的單字 id：`<bookSlug>:<headword>`。
 * 進度存在 localStorage，id 必須跨 build 穩定，否則使用者的複習紀錄會全部對不上。
 * 因此用內容衍生 id，不用陣列索引（索引會隨資料增修而位移）。
 */
export function wordId(bookSlug: string, headword: string): string {
  return `${bookSlug}:${headword}`
}

function toWord(bookSlug: string, raw: RawWord): WordWithExamples {
  const id = wordId(bookSlug, raw.headword)
  return {
    id,
    headword: raw.headword,
    phonetic: raw.phonetic ?? null,
    partOfSpeech: raw.partOfSpeech ?? null,
    definitionZh: raw.definitionZh,
    examTags: raw.examTags ?? [],
    examples: (raw.examples ?? []).map((ex, i) => ({
      id: `${id}#${i}`,
      sentence: ex.sentence,
      translationZh: ex.translationZh,
      source: null,
    })),
  }
}

interface StaticBook extends WordBookData {
  words: WordWithExamples[]
}

// 模組載入時建一次索引即可——資料是靜態的，不會變。
const BOOKS: StaticBook[] = RAW_BOOKS.map((raw) => ({
  // 靜態內容裡 slug 本身就是唯一鍵，直接當 id 用。
  id: raw.slug,
  slug: raw.slug,
  name: raw.name,
  description: raw.description ?? null,
  level: raw.level ?? null,
  wordCount: raw.words.length,
  words: raw.words.map((w) => toWord(raw.slug, w)),
}))

const BY_SLUG = new Map(BOOKS.map((b) => [b.slug, b]))
const WORD_BY_ID = new Map(BOOKS.flatMap((b) => b.words).map((w) => [w.id, w]))

export function listWordBooks(): WordBookData[] {
  return BOOKS.map((b) => ({
    id: b.id, slug: b.slug, name: b.name,
    description: b.description, level: b.level, wordCount: b.wordCount,
  }))
}

export function getBookBySlug(slug: string): StaticBook | null {
  return BY_SLUG.get(slug) ?? null
}

export function listWordsByBook(slug: string): WordWithExamples[] {
  return BY_SLUG.get(slug)?.words ?? []
}

export function getWordById(id: string): WordWithExamples | null {
  return WORD_BY_ID.get(id) ?? null
}

export function listAllWords(): WordWithExamples[] {
  return [...WORD_BY_ID.values()]
}

/** MC 干擾選項用的釋義池。slug 省略 → 全部單字書。 */
export function listDefinitions(slug?: string): string[] {
  const words = slug ? listWordsByBook(slug) : listAllWords()
  return [...new Set(words.map((w) => w.definitionZh))]
}
