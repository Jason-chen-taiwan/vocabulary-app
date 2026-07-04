import { todayYmd, daysBetween } from '@/lib/gamification/date'

// 任一 Date 在使用者時區的 YYYY-MM-DD（沿用 gamification 的 todayYmd）。
export function dayKey(d: Date, timezone: string): string {
  return todayYmd(d, timezone)
}

// UTC anchor of a YYYY-MM-DD, so we can step whole calendar days deterministically.
function ymdPlus(ymd: string, deltaDays: number): string {
  const d = new Date(`${ymd}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + deltaDays)
  return d.toISOString().slice(0, 10)
}

export function groupReviewsByDay(logs: { reviewedAt: Date }[], timezone: string): Map<string, number> {
  const m = new Map<string, number>()
  for (const l of logs) {
    const k = dayKey(l.reviewedAt, timezone)
    m.set(k, (m.get(k) ?? 0) + 1)
  }
  return m
}

export interface DayAccuracy { day: string; correct: number; total: number }
export function dailyAccuracy(logs: { reviewedAt: Date; rating: number }[], timezone: string): DayAccuracy[] {
  const byDay = new Map<string, { correct: number; total: number }>()
  for (const l of logs) {
    const k = dayKey(l.reviewedAt, timezone)
    const cur = byDay.get(k) ?? { correct: 0, total: 0 }
    cur.total += 1
    if (l.rating >= 2) cur.correct += 1
    byDay.set(k, cur)
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([day, v]) => ({ day, correct: v.correct, total: v.total }))
}

export interface DueBucket { day: string; count: number }
export function dueForecast(cards: { due: Date }[], now: Date, timezone: string, days = 7): DueBucket[] {
  const today = todayYmd(now, timezone)
  const keys = Array.from({ length: days }, (_, i) => ymdPlus(today, i))
  const counts = new Map<string, number>(keys.map((k) => [k, 0]))
  for (const c of cards) {
    const k = dayKey(c.due, timezone)
    const idx = daysBetween(today, k) // k - today，天
    if (idx <= 0) counts.set(today, (counts.get(today) ?? 0) + 1)          // 逾期或今日
    else if (idx < days) counts.set(keys[idx], (counts.get(keys[idx]) ?? 0) + 1)
    // idx >= days：超出視界，忽略
  }
  return keys.map((day) => ({ day, count: counts.get(day) ?? 0 }))
}

// 每本書拆成三態：mastered（精熟）/ studied（已開始但未精熟）/ new（未開始）。
// started = mastered + studied；new = max(0, total - started)。
export interface BookBreakdown { slug: string; name: string; total: number; mastered: number; studied: number; newCount: number }
export function bookBreakdown(
  cards: { mastered: boolean; wordBookId: string }[],
  books: { id: string; slug: string; name: string; wordCount: number }[],
): BookBreakdown[] {
  const byBook = new Map<string, { mastered: number; started: number }>()
  for (const c of cards) {
    const cur = byBook.get(c.wordBookId) ?? { mastered: 0, started: 0 }
    cur.started += 1
    if (c.mastered) cur.mastered += 1
    byBook.set(c.wordBookId, cur)
  }
  return books.map((b) => {
    const cur = byBook.get(b.id) ?? { mastered: 0, started: 0 }
    return {
      slug: b.slug, name: b.name, total: b.wordCount,
      mastered: cur.mastered,
      studied: cur.started - cur.mastered,
      newCount: Math.max(0, b.wordCount - cur.started),
    }
  })
}

export interface StateCounts { newCount: number; learning: number; review: number; mastered: number; startedTotal: number }
export function stateCounts(cards: { state: number; mastered: boolean }[], totalWords: number): StateCounts {
  let learning = 0, review = 0, mastered = 0
  for (const c of cards) {
    if (c.mastered) { mastered += 1; continue }
    if (c.state === 2) review += 1  // FSRS Review（已畢業）
    else learning += 1              // Learning/Relearning
  }
  const startedTotal = cards.length
  return { newCount: Math.max(0, totalWords - startedTotal), learning, review, mastered, startedTotal }
}

export type HeatLevel = 0 | 1 | 2 | 3
export interface HeatCell { day: string; count: number; level: HeatLevel }
export const HEAT_THRESHOLDS: [number, number, number] = [1, 3, 6] // >=1 / >=3 / >=6
export function heatLevel(count: number): HeatLevel {
  if (count >= HEAT_THRESHOLDS[2]) return 3
  if (count >= HEAT_THRESHOLDS[1]) return 2
  if (count >= HEAT_THRESHOLDS[0]) return 1
  return 0
}
export function heatmapCells(byDay: Map<string, number>, now: Date, timezone: string, weeks = 12): HeatCell[] {
  const today = todayYmd(now, timezone)
  const total = weeks * 7
  const cells: HeatCell[] = []
  for (let i = total - 1; i >= 0; i--) {
    const day = ymdPlus(today, -i)
    const count = byDay.get(day) ?? 0
    cells.push({ day, count, level: heatLevel(count) })
  }
  return cells
}
