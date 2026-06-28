import { signOut } from '@/auth'

export function SignOutButton() {
  return (
    <form action={async () => { 'use server'; await signOut({ redirectTo: '/login' }) }}>
      <button type="submit" className="text-sm font-semibold text-neutral-600 underline hover:text-neutral-900">登出</button>
    </form>
  )
}
