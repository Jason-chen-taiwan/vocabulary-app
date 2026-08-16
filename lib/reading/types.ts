export type PassageKind = 'toeic' | 'story'
export type PassageQuestionType = 'main' | 'detail' | 'inference'

// l = 詞形還原後的 lemma（小寫）；標點/空白 token 無 l
export interface PassageToken { w: string; l?: string }

// curated：建置期標記「在精修字庫」；seed 時換成實際 wordId
export interface GlossEntry { zh: string; pos?: string; wordId?: string; curated?: boolean }

export interface PassageQuestion {
  id: string
  type: PassageQuestionType
  stem: string
  options: string[] // 恰 4 個
  answer: number    // 0–3；只在 server 使用
}

// content/passages/*.json 的形狀（建置產物＝seed 輸入）
export interface PassageFile {
  slug: string
  kind: PassageKind
  title: string
  titleZh?: string
  level?: string
  topic?: string
  source: string
  wordCount: number
  content: PassageToken[][]
  glossary: Record<string, GlossEntry>
  questions: PassageQuestion[]
}

// DB 讀出後的完整形狀（server 端）
export interface PassageData {
  id: string
  slug: string
  kind: PassageKind
  title: string
  titleZh: string | null
  level: string | null
  topic: string | null
  source: string
  wordCount: number
  content: PassageToken[][]
  glossary: Record<string, GlossEntry>
  questions: PassageQuestion[]
}

export interface PassageListItem {
  id: string
  slug: string
  kind: PassageKind
  title: string
  titleZh: string | null
  level: string | null
  topic: string | null
  wordCount: number
  questionCount: number
}

export type ClientPassageQuestion = Omit<PassageQuestion, 'answer'>

// 給前端的 payload：questions 一律剝掉 answer
export interface PassagePayload extends Omit<PassageData, 'questions'> {
  questions: ClientPassageQuestion[]
}

export interface PassageResultData {
  passageId: string
  correctCount: number
  totalCount: number
  readSeconds: number | null
  completedAt: Date
}
