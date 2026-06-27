import { getCurrentUser } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import { SignOutButton } from '@/components/sign-out-button'

export default async function Home() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-xl font-bold">歡迎，{user.name ?? user.email}</h1>
      <SignOutButton />
    </main>
  )
}
