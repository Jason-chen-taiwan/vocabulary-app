import { SignInButton } from '@/components/sign-in-button'
import { getCurrentUser } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import { Mascot } from '@/components/ui/mascot'

export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  if (await getCurrentUser()) redirect('/')
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <Mascot mood="hi" size={132} />
      <h1 className="text-3xl font-extrabold text-neutral-900">VocabApp</h1>
      <p className="text-neutral-600">考試導向的英文字彙學習，邊背邊解鎖成就。</p>
      <SignInButton />
    </main>
  )
}
