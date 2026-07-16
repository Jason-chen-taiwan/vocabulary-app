import Link from 'next/link'
import { Mascot } from '@/components/ui/mascot'
import { Card } from '@/components/ui/card'
import type { WordBookData } from '@/lib/content/types'

// 未登入首頁。純呈現：資料由 app/page.tsx 抓好傳入，本身不碰 DB。
const FEATURES = [
  { icon: '🧠', title: '科學排程', desc: 'FSRS 演算法算出每個字的最佳複習時機，該複習才複習。' },
  { icon: '🔥', title: '遊戲化動力', desc: '連續天數、徽章、硬幣商店幫小狐狸換裝，背單字不孤單。' },
  { icon: '📴', title: '離線也能背', desc: 'PWA 可安裝到手機主畫面，通勤沒網路照樣複習。' },
] as const

// 頁尾內部連結：挑常見 TOEIC 字，讓搜尋引擎從首頁爬得到單字頁。
const FEATURED_WORDS = ['invoice', 'budget', 'schedule', 'contract', 'refund', 'shipment'] as const

export function LandingPage({ books }: { books: WordBookData[] }) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col items-center gap-10 px-4 py-12">
      <section className="flex flex-col items-center gap-4 text-center">
        <Mascot mood="hi" size={132} />
        <h1 className="text-3xl font-extrabold text-neutral-900">TOEIC 單字，用科學排程背起來</h1>
        <p className="max-w-md text-neutral-600">
          免費的英文字彙學習 PWA：FSRS 間隔重複、遊戲化成就、離線複習，一個帳號跨裝置同步。
        </p>
        <Link
          href="/login"
          className="inline-flex min-h-11 items-center justify-center rounded-control bg-primary-500 px-8 py-4 text-lg font-extrabold text-white shadow-[0_6px_14px_rgba(255,106,61,.35)] transition hover:bg-primary-600"
        >
          用 Google 登入，免費開始
        </Link>
      </section>

      <section className="grid w-full gap-4 sm:grid-cols-3">
        {FEATURES.map((f) => (
          <Card key={f.title} className="flex flex-col items-center gap-2 p-5 text-center">
            <span className="text-3xl">{f.icon}</span>
            <h2 className="font-extrabold text-neutral-900">{f.title}</h2>
            <p className="text-sm text-neutral-600">{f.desc}</p>
          </Card>
        ))}
      </section>

      {books.length > 0 && (
        <section className="w-full">
          <h2 className="mb-3 text-center text-lg font-extrabold text-neutral-900">收錄單字書</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {books.map((b) => (
              <Card key={b.slug} className="flex items-center justify-between p-4">
                <span className="font-bold text-neutral-900">{b.name}</span>
                <span className="text-xs font-semibold text-neutral-600">{b.wordCount} 字</span>
              </Card>
            ))}
          </div>
        </section>
      )}

      <section className="w-full text-center">
        <h2 className="mb-2 text-sm font-bold text-neutral-600">熱門單字</h2>
        <div className="flex flex-wrap justify-center gap-2">
          {FEATURED_WORDS.map((w) => (
            <Link key={w} href={`/word/${w}`} className="rounded-pill bg-primary-50 px-3 py-1 text-sm font-semibold text-primary-600 hover:bg-primary-100">
              {w}
            </Link>
          ))}
        </div>
      </section>
    </main>
  )
}
