import { cache } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { ContentRepository } from '@/lib/content/repository'
import { TtsButton } from '@/components/tts-button'
import { Card } from '@/components/ui/card'

// generateMetadata 與頁面本體共用同一次查詢（React request-scoped cache），避免每次瀏覽打兩次 DB。
const getPublicWord = cache((headword: string) => new ContentRepository().getPublicWordByHeadword(headword))

export async function generateMetadata({ params }: { params: Promise<{ headword: string }> }): Promise<Metadata> {
  const { headword } = await params
  const word = await getPublicWord(headword)
  if (!word) return { title: '找不到單字｜VocabApp' }
  const firstExample = word.examples[0]?.sentence ?? ''
  const title = `${word.headword} 中文意思・例句｜VocabApp`
  const description = `${word.headword}：${word.definitionZh}。${firstExample}`
  return {
    title,
    description,
    alternates: { canonical: `/word/${encodeURIComponent(word.headword)}` },
    // openGraph 是整欄取代、非合併，覆寫 layout 的同時要把 og:image/siteName/type 一併帶上，
    // 否則 LINE/FB 分享預覽只剩文字。
    openGraph: {
      title,
      description,
      url: `/word/${encodeURIComponent(word.headword)}`,
      siteName: 'VocabApp',
      type: 'article',
      images: ['/og.png'],
    },
  }
}

export default async function PublicWordPage({ params }: { params: Promise<{ headword: string }> }) {
  const { headword } = await params
  const word = await getPublicWord(headword)
  if (!word) notFound()

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <Link href="/" className="text-sm font-semibold text-neutral-600 hover:text-neutral-900">← VocabApp 首頁</Link>
      <div className="mt-3 flex items-center gap-3">
        <h1 className="text-3xl font-extrabold text-neutral-900">{word.headword}</h1>
        <TtsButton text={word.headword} />
      </div>
      <div className="mt-1 flex items-center gap-2 text-neutral-600">
        {word.phonetic && <span>{word.phonetic}</span>}
        {word.partOfSpeech && (
          <span className="rounded-pill bg-primary-100 px-2 py-0.5 text-xs font-bold text-primary-600">{word.partOfSpeech}</span>
        )}
      </div>
      <p className="mt-3 text-lg text-neutral-900">{word.definitionZh}</p>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {word.books.map((b) => (
          <span key={b.slug} className="rounded-pill bg-primary-50 px-2 py-0.5 text-xs font-semibold text-neutral-600">
            📚 {b.name}
          </span>
        ))}
      </div>

      {word.examples.length > 0 && (
        <>
          <h2 className="mt-6 mb-2 text-sm font-bold text-neutral-600">例句</h2>
          <ul className="space-y-3">
            {word.examples.map((e) => (
              <li key={e.id}>
                <Card className="p-4">
                  <div className="flex items-start gap-2">
                    <p className="flex-1 text-neutral-900">{e.sentence}</p>
                    <TtsButton text={e.sentence} />
                  </div>
                  <p className="mt-1 text-sm text-neutral-600">{e.translationZh}</p>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}

      <Card className="mt-8 flex flex-col items-center gap-3 p-6 text-center">
        <p className="font-bold text-neutral-900">想把「{word.headword}」記進長期記憶？</p>
        <p className="text-sm text-neutral-600">登入後用科學排程（FSRS）複習，還有連續天數與徽章等你解鎖。</p>
        <Link
          href="/login"
          className="inline-flex min-h-11 items-center justify-center rounded-control bg-primary-500 px-6 py-3 font-extrabold text-white shadow-[0_6px_14px_rgba(255,106,61,.35)] transition hover:bg-primary-600"
        >
          免費開始學習
        </Link>
      </Card>
    </main>
  )
}
