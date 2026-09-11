import { scheduler } from '@/lib/learning/scheduler'
import { grade, MASTERY_THRESHOLD } from '@/lib/learning/grading'
import { pickQuestionType, type QuestionType } from '@/lib/learning/question'
import { todayYmd, daysBetween } from '@/lib/gamification/date'
import type { CardState } from '@/lib/learning/types'
import type { NotebookEntry, PassageResultEntry } from './reading'

// 單人版進度：全部存在瀏覽器。沒有帳號、沒有後端、沒有同步。
// 排程沿用既有的 FSRS scheduler（lib/learning/scheduler），這裡只負責「存哪裡」。
const KEY = 'vocab.progress.v1'

/** 儲存用的卡片狀態：日期以 ISO 字串存（JSON 沒有 Date 型別）。 */
export interface StoredCard {
  due: string
  stability: number
  difficulty: number
  elapsedDays: number
  scheduledDays: number
  reps: number
  lapses: number
  state: number
  learningSteps: number
  lastReview: string | null
  /** 連續答對次數，決定題型與是否精熟。 */
  streak: number
}

export interface DayLog {
  reviews: number
  correct: number
}

export interface Progress {
  cards: Record<string, StoredCard>
  mastered: string[]
  /** YYYY-MM-DD → 當日作答統計，供統計頁與熱力圖使用。 */
  days: Record<string, DayLog>
  streak: number
  longestStreak: number
  lastStudyDate: string | null
  dailyGoal: number
  /** 閱讀短文成績（slug → 最近一次結果）。舊版備份沒有這欄，讀取時補空物件。 */
  passages: Record<string, PassageResultEntry>
  /** 閱讀時收集的生字本，最新的排前面。 */
  notebook: NotebookEntry[]
}

export function emptyProgress(): Progress {
  return {
    cards: {}, mastered: [], days: {},
    streak: 0, longestStreak: 0, lastStudyDate: null, dailyGoal: 20,
    passages: {}, notebook: [],
  }
}

function toStored(card: CardState, streak: number): StoredCard {
  return {
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsedDays,
    scheduledDays: card.scheduledDays,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    learningSteps: card.learningSteps,
    lastReview: card.lastReview ? card.lastReview.toISOString() : null,
    streak,
  }
}

function toCardState(s: StoredCard): CardState {
  return {
    due: new Date(s.due),
    stability: s.stability,
    difficulty: s.difficulty,
    elapsedDays: s.elapsedDays,
    scheduledDays: s.scheduledDays,
    reps: s.reps,
    lapses: s.lapses,
    state: s.state,
    learningSteps: s.learningSteps,
    lastReview: s.lastReview ? new Date(s.lastReview) : null,
  }
}

/** 結構檢查：localStorage 的內容可能被手動改壞或來自舊版，壞了就當作沒有。 */
function isProgress(v: unknown): v is Progress {
  if (typeof v !== 'object' || v === null) return false
  const p = v as Record<string, unknown>
  return (
    typeof p.cards === 'object' && p.cards !== null && !Array.isArray(p.cards) &&
    Array.isArray(p.mastered) &&
    typeof p.days === 'object' && p.days !== null
  )
}

export function loadProgress(): Progress {
  if (typeof localStorage === 'undefined') return emptyProgress()
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return emptyProgress()
    const parsed: unknown = JSON.parse(raw)
    if (!isProgress(parsed)) return emptyProgress()
    return { ...emptyProgress(), ...parsed }
  } catch {
    return emptyProgress()
  }
}

export function saveProgress(p: Progress): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    // 配額滿或隱私模式：略過，不讓儲存失敗打斷複習。
  }
}

/**
 * 記一次作答：更新 FSRS 排程、連續答對數、精熟清單、當日統計與連續學習天數。
 * 回傳新的 Progress（不就地修改，方便 React state 更新）。
 */
export function recordReview(
  prev: Progress,
  wordId: string,
  isCorrect: boolean,
  now: Date,
  timezone: string,
): Progress {
  const existing = prev.cards[wordId]
  const prevStreak = existing?.streak ?? 0
  const { rating, nextStreak, mastered } = grade(isCorrect, prevStreak)

  const base = existing ? toCardState(existing) : scheduler.newCard(now)
  const scheduled = scheduler.review(base, rating, now)

  const today = todayYmd(now, timezone)
  const day = prev.days[today] ?? { reviews: 0, correct: 0 }

  // 連續天數：同一天重複作答不重複計算；隔一天 +1；斷掉則重新從 1 起算。
  let streak = prev.streak
  if (prev.lastStudyDate !== today) {
    const gap = prev.lastStudyDate ? daysBetween(prev.lastStudyDate, today) : null
    streak = gap === 1 ? prev.streak + 1 : 1
  }

  const masteredSet = new Set(prev.mastered)
  if (mastered) masteredSet.add(wordId)
  else masteredSet.delete(wordId)

  return {
    ...prev,
    cards: { ...prev.cards, [wordId]: toStored(scheduled, nextStreak) },
    mastered: [...masteredSet],
    days: { ...prev.days, [today]: { reviews: day.reviews + 1, correct: day.correct + (isCorrect ? 1 : 0) } },
    streak,
    longestStreak: Math.max(prev.longestStreak, streak),
    lastStudyDate: today,
  }
}

export function todayStats(p: Progress, now: Date, timezone: string): DayLog {
  return p.days[todayYmd(now, timezone)] ?? { reviews: 0, correct: 0 }
}

export interface QueueItem {
  wordId: string
  questionType: QuestionType
  isNew: boolean
}

/**
 * 組出這次要複習的題目佇列：先到期的舊卡，再補沒學過的新卡。
 * 取代原本 buildSession 的三個 DB 查詢——這裡資料都在記憶體，直接篩。
 */
export function buildQueue(
  p: Progress,
  wordIds: string[],
  now: Date,
  limits: { newLimit: number; dueLimit: number },
): QueueItem[] {
  const due: QueueItem[] = []
  const fresh: QueueItem[] = []

  for (const id of wordIds) {
    const card = p.cards[id]
    if (!card) {
      // 新字一律從選擇題開始。
      if (fresh.length < limits.newLimit) fresh.push({ wordId: id, questionType: 'mc', isNew: true })
      continue
    }
    if (new Date(card.due).getTime() <= now.getTime() && due.length < limits.dueLimit) {
      due.push({ wordId: id, questionType: pickQuestionType(card.streak), isNew: false })
    }
  }
  return [...due, ...fresh]
}

export function masteredCount(p: Progress, wordIds: string[]): number {
  const set = new Set(p.mastered)
  return wordIds.filter((id) => set.has(id)).length
}

export function exportProgress(p: Progress): string {
  return JSON.stringify(p, null, 2)
}

export function importProgress(json: string): Progress | null {
  try {
    const parsed: unknown = JSON.parse(json)
    if (!isProgress(parsed)) return null
    return { ...emptyProgress(), ...parsed }
  } catch {
    return null
  }
}

export { MASTERY_THRESHOLD }
