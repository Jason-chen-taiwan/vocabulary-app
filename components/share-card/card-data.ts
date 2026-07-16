// 分享卡「資料 → 文案」純函式。canvas 繪製（draw-card.ts）只吃這裡的輸出，文案邏輯集中可測。
export interface ShareCardStats {
  streak: number
  level: number
  badgeCount: number
  goalMet: boolean
  dateLabel: string
}

export interface ShareCardContent {
  headline: string
  lines: { label: string; value: string }[]
  footer: string
  dateLabel: string
}

export function buildShareCardContent(s: ShareCardStats): ShareCardContent {
  const headline = s.goalMet
    ? s.streak > 0
      ? `我在 VocabApp 連續達標 ${s.streak} 天！`
      : '我今天在 VocabApp 完成單字複習！'
    : `我正在 VocabApp 累積連續 ${s.streak} 天！`
  return {
    headline,
    lines: [
      { label: '🔥 連續達標', value: `${s.streak} 天` },
      { label: '⭐ 等級', value: `Lv.${s.level}` },
      { label: '🏅 徽章', value: `${s.badgeCount} 枚` },
    ],
    footer: '0stack.org・免費 TOEIC 單字 App',
    dateLabel: s.dateLabel,
  }
}
