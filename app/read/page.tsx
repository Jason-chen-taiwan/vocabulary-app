import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'
import { PassageRepository } from '@/lib/reading/repository'
import { GamificationBar } from '@/components/gamification-bar'
import { CardLink } from '@/components/ui/card'

export const dynamic = 'force-dynamic'

const KIND_LABEL: Record<string, string> = { toeic: '多益情境短文', story: '故事閱讀' }

export default async function ReadListPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const repo = new PassageRepository()
  const passages = await repo.listPassages()
  const results = await repo.listResults(user.id, passages.map((p) => p.id))

  return (
    <div className="min-h-screen bg-bg-warm">
      <GamificationBar />
      <main className="mx-auto w-full max-w-2xl px-4 py-8">
        <h1 className="text-2xl font-extrabold text-neutral-900">沉浸閱讀 📖</h1>
        <p className="mt-1 text-neutral-600">讀文章、點生字、練 Part 7 — 收藏的字會進入你的複習排程</p>
        {(['toeic', 'story'] as const).map((kind) => {
          const group = passages.filter((p) => p.kind === kind)
          if (group.length === 0) return null
          return (
            <section key={kind} className="mt-6">
              <h2 className="text-lg font-extrabold text-neutral-900">{KIND_LABEL[kind]}</h2>
              <div className="mt-3 space-y-3">
                {group.map((p) => {
                  const r = results.get(p.id)
                  return (
                    <CardLink key={p.slug} href={`/read/${p.slug}`} className="block p-5">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h3 className="font-extrabold text-neutral-900">{p.title}</h3>
                          <p className="mt-1 text-sm text-neutral-600">
                            {p.titleZh ? `${p.titleZh} · ` : ''}{p.wordCount} 字
                            {p.questionCount > 0 ? ` · ${p.questionCount} 題` : ''}
                          </p>
                        </div>
                        <div className="shrink-0 text-sm font-bold">
                          {r ? <span className="text-success">✓ {p.questionCount > 0 ? `${r.correctCount}/${r.totalCount}` : '已讀'}</span>
                             : p.level ? <span className="rounded-pill bg-primary-100 px-3 py-1 text-primary-600">{p.level}</span> : null}
                        </div>
                      </div>
                    </CardLink>
                  )
                })}
              </div>
            </section>
          )
        })}
        <p className="mt-8 text-center"><Link href="/" className="text-sm font-bold text-primary-600 hover:underline">← 回首頁</Link></p>
      </main>
    </div>
  )
}
