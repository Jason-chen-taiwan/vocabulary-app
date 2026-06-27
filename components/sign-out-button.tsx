import { signOut } from '@/auth'

export function SignOutButton() {
  return (
    <form action={async () => { 'use server'; await signOut({ redirectTo: '/login' }) }}>
      <button type="submit" className="text-sm text-gray-500 underline">登出</button>
    </form>
  )
}
