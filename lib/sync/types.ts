import type { QuestionType } from '@/lib/learning/question'
import type { BuiltReviewItem } from '@/lib/learning/review-items'

// 離線作答佇列的一筆原始作答（同步時 server 重判，本地判分不上傳）。
export interface QueueEntry {
  uuid: string
  wordId: string
  questionType: QuestionType
  userAnswer: string
  answeredAt: string // ISO 8601
}

// /api/offline/pack 回傳的一本書的今日複習包。
export interface OfflinePack {
  slug: string
  name: string
  items: BuiltReviewItem[]
}

// IndexedDB 裡存的包：加當日 ymd，隔日視為過期。
export interface StoredPack extends OfflinePack {
  ymd: string
}
