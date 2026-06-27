import { notFound, redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'
import { ContentRepository } from '@/lib/content/repository'
import { TtsButton } from '@/components/tts-button'

export default async function WordDetailPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await getCurrentUser())) redirect('/login')
  const { id } = await params
  const word = await new ContentRepository().getWordWithExamples(id)
  if (!word) notFound()
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <div className="flex items-center gap-3">
        <h1 className="text-3xl font-bold">{word.headword}</h1>
        <TtsButton text={word.headword} />
      </div>
      <div className="mt-1 text-gray-400">
        {word.phonetic && <span className="mr-2">{word.phonetic}</span>}
        {word.partOfSpeech && <span className="text-gray-500">{word.partOfSpeech}</span>}
      </div>
      <p className="mt-3 text-lg">{word.definitionZh}</p>
      <h2 className="mt-6 mb-2 text-sm font-semibold text-gray-400">例句</h2>
      <ul className="space-y-4">
        {word.examples.map((e) => (
          <li key={e.id} className="rounded-lg border border-gray-800 p-3">
            <div className="flex items-start gap-2">
              <p className="flex-1">{e.sentence}</p>
              <TtsButton text={e.sentence} />
            </div>
            <p className="mt-1 text-sm text-gray-400">{e.translationZh}</p>
          </li>
        ))}
      </ul>
    </main>
  )
}
