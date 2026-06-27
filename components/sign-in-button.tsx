import { signIn } from '@/auth'

export function SignInButton() {
  return (
    <form action={async () => { 'use server'; await signIn('google', { redirectTo: '/' }) }}>
      <button type="submit" className="rounded-lg bg-black px-4 py-2 text-white">
        使用 Google 登入
      </button>
    </form>
  )
}
