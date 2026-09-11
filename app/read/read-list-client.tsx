'use client'
import { CardLink } from '@/components/ui/card'
import { listPassages } from '@/lib/reading/static'
import { useProgress } from '@/lib/progress/use-progress'

const KIND_LABEL: Record<string, string> = { toeic: '多益情境短文', story: '故事閱讀' }

export function ReadListClient() {
  // 成績存在本機；SSR 時 useProgress 回傳 null，先當作都還沒讀過。
  const p = useProgress()
  const passages = listPassages()

  return (
    <>
      {(['toeic', 'story'] as const).map((kind) => {
        const group = passages.filter((x) => x.kind === kind)
        if (group.length === 0) return null
        return (
          <section key={kind} className="mt-6">
            <h2 className="text-lg font-extrabold text-neutral-900">{KIND_LABEL[kind]}</h2>
            <div className="mt-3 space-y-3">
              {group.map((x) => {
                const r = p?.passages?.[x.slug] ?? null
                return (
                  <CardLink key={x.slug} href={`/read/${x.slug}`} className="block p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="font-extrabold text-neutral-900">{x.title}</h3>
                        <p className="mt-1 text-sm text-neutral-600">
                          {x.titleZh ? `${x.titleZh} · ` : ''}{x.wordCount} 字
                          {x.questionCount > 0 ? ` · ${x.questionCount} 題` : ''}
                        </p>
                      </div>
                      <div className="shrink-0 text-sm font-bold">
                        {r ? <span className="text-success">✓ {x.questionCount > 0 ? `${r.correctCount}/${r.totalCount}` : '已讀'}</span>
                           : x.level ? <span className="rounded-pill bg-primary-100 px-3 py-1 text-primary-600">{x.level}</span> : null}
                      </div>
                    </div>
                  </CardLink>
                )
              })}
            </div>
          </section>
        )
      })}
    </>
  )
}
