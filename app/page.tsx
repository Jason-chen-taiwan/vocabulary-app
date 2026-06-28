import Link from 'next/link'
import { getCurrentUser } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import { SignOutButton } from '@/components/sign-out-button'
import { GamificationBar } from '@/components/gamification-bar'

export default async function Home() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  return (
    <>
      <GamificationBar />
      <main className="flex min-h-screen flex-col items-center justify-center gap-4">
        <h1 className="text-xl font-bold">歡迎，{user.name ?? user.email}</h1>
        <Link href="/books" className="rounded-lg bg-white px-4 py-2 font-medium text-black hover:bg-gray-200">
          開始學單字
        </Link>
        <SignOutButton />
      </main>
    </>
  )
}
