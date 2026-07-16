import { describe, it, expect } from 'vitest'
import { buildShareCardContent } from '@/components/share-card/card-data'

const base = { streak: 12, level: 5, badgeCount: 8, goalMet: true, dateLabel: '2026年7月16日' }

describe('buildShareCardContent', () => {
  it('組出標題、三行數據與 footer', () => {
    const c = buildShareCardContent(base)
    expect(c.headline).toBe('我在 VocabApp 連續達標 12 天！')
    expect(c.lines).toEqual([
      { label: '🔥 連續達標', value: '12 天' },
      { label: '⭐ 等級', value: 'Lv.5' },
      { label: '🏅 徽章', value: '8 枚' },
    ])
    expect(c.footer).toBe('0stack.org・免費 TOEIC 單字 App')
    expect(c.dateLabel).toBe('2026年7月16日')
  })

  it('streak 0 時標題改為今日達標語氣（避免尷尬的 0 天）', () => {
    expect(buildShareCardContent({ ...base, streak: 0 }).headline).toBe('我今天在 VocabApp 完成單字複習！')
  })

  it('goalMet false 時標題為進行中語氣', () => {
    expect(buildShareCardContent({ ...base, goalMet: false }).headline).toBe('我正在 VocabApp 累積連續 12 天！')
  })
})
