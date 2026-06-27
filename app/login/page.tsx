import { SignInButton } from '@/components/sign-in-button'
import { getCurrentUser } from '@/lib/auth/session'
import { redirect } from 'next/navigation'

export default async function LoginPage() {
  if (await getCurrentUser()) redirect('/')
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6">
      <h1 className="text-2xl font-bold">VocabApp</h1>
      <p className="text-gray-500">登入開始背單字</p>
      <SignInButton />
    </main>
  )
}
