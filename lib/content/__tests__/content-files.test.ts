import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { checkContent, type CheckBook } from '@/lib/content/check-content'

// 真正的內容把關：直接讀 content/*.json 跑 checkContent。
// 以前靠 `npm run check-content`（需要 node --experimental-strip-types 才能
// import .ts），CI 上會因 Node 版本不同而爆掉；放進 vitest 就沒有這個限制。
const files = readdirSync('content').filter(
  (f) => (f.startsWith('toeic-') || f.startsWith('ielts-')) && f.endsWith('.json'),
)
const books: CheckBook[] = files.map((f) => JSON.parse(readFileSync(`content/${f}`, 'utf8')))

describe('content files', () => {
  it('finds every word book', () => {
    expect(books.length).toBeGreaterThanOrEqual(22)
  })

  it('has no content problems', () => {
    // 失敗時把問題逐條印出來，而不是只說「陣列長度不是 0」
    expect(checkContent(books).join('\n')).toBe('')
  })

  it('does not lose words', () => {
    // 下限而非固定值：新增單字書時不該讓這個測試變成假警報，
    // 但若有人誤刪內容仍會被擋下。
    const total = books.reduce((n, b) => n + b.words.length, 0)
    expect(total).toBeGreaterThanOrEqual(2568)
  })
})
