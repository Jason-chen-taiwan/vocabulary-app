import { notFound, redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'
import { ContentRepository } from '@/lib/content/repository'
import { PassageRepository, toPassagePayload } from '@/lib/reading/repository'
import { GamificationBar } from '@/components/gamification-bar'
import { PassageReader } from '@/components/passage-reader'

export const dynamic = 'force-dynamic'

export default async function ReadPassagePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const repo = new PassageRepository()
  const passage = await repo.getPassageBySlug(slug)
  if (!passage) notFound()

  const entries = Object.entries(passage.glossary).map(([lemma, e]) => ({ lemma, wordId: e.wordId }))
  const curatedIds = entries.filter((e) => e.wordId).map((e) => e.wordId as string)
  // 三筆互不相依 → 並行
  const [curatedWords, collectedLemmas, priorResult] = await Promise.all([
    curatedIds.length ? new ContentRepository().listWordsWithExamplesByIds(curatedIds) : Promise.resolve([]),
    repo.listCollectedLemmas(user.id, entries),
    repo.getResult(user.id, passage.id),
  ])

  return (
    <div className="min-h-screen bg-bg-warm">
      <GamificationBar />
      <main className="mx-auto w-full max-w-2xl px-4 py-8">
        <h1 className="text-2xl font-extrabold text-neutral-900">{passage.title}</h1>
        <p className="mt-1 mb-4 text-sm text-neutral-600">
          {passage.titleZh ? `${passage.titleZh} · ` : ''}{passage.wordCount} 字 · 點單字看釋義
        </p>
        <PassageReader
          passage={toPassagePayload(passage)}
          curatedWords={curatedWords}
          collectedLemmas={collectedLemmas}
          priorResult={priorResult ? { correctCount: priorResult.correctCount, totalCount: priorResult.totalCount } : null}
        />
        <p className="mt-6 text-xs text-neutral-600">出處：{passage.source}</p>
      </main>
    </div>
  )
}
