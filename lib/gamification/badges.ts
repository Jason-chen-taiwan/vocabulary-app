import type { BadgeDef } from './types'

// 徽章為靜態設定資料（YAGNI：不建 Badge 表）。新增徽章 = 在此加一筆 + 在 rules.evaluateBadges 已涵蓋的 type 內。
export const BADGES: BadgeDef[] = [
  { key: 'streak-7', name: '一週不間斷', description: '連續達標 7 天', type: 'streak', threshold: 7 },
  { key: 'streak-30', name: '一月不間斷', description: '連續達標 30 天', type: 'streak', threshold: 30 },
  { key: 'streak-100', name: '百日不間斷', description: '連續達標 100 天', type: 'streak', threshold: 100 },
  { key: 'mastered-10', name: '初窺門徑', description: '記憶完成 10 個單字', type: 'mastered', threshold: 10 },
  { key: 'mastered-50', name: '漸入佳境', description: '記憶完成 50 個單字', type: 'mastered', threshold: 50 },
  { key: 'mastered-100', name: '融會貫通', description: '記憶完成 100 個單字', type: 'mastered', threshold: 100 },
  { key: 'level-5', name: 'Lv.5', description: '達到等級 5', type: 'level', threshold: 5 },
  { key: 'level-10', name: 'Lv.10', description: '達到等級 10', type: 'level', threshold: 10 },
  { key: 'level-25', name: 'Lv.25', description: '達到等級 25', type: 'level', threshold: 25 },
  { key: 'perfect-session', name: '完美一回', description: '單次複習全部答對', type: 'perfect', threshold: 1 },
]
