import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'
import { ContentRepository } from '@/lib/content/repository'
import { TtsButton } from '@/components/tts-button'
import { Card } from '@/components/ui/card'

export default async function WordDetailPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await getCurrentUser())) redirect('/login')
  const { id } = await params
  const word = await new ContentRepository().getWordWithExamples(id)
  if (!word) notFound()
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <Link href={`/books`} className="text-sm font-semibold text-neutral-600 hover:text-neutral-900">← 單字書</Link>
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
    </main>
  )
}
