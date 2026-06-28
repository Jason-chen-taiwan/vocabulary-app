import { signIn } from '@/auth'

export function SignInButton() {
  return (
    <form action={async () => { 'use server'; await signIn('google', { redirectTo: '/' }) }}>
      <button
        type="submit"
        className="inline-flex min-h-11 items-center justify-center rounded-control border-2 border-primary-200 bg-surface px-5 py-3 font-bold text-neutral-900 shadow-[0_6px_14px_rgba(255,106,61,.15)] transition hover:bg-primary-50"
      >
        使用 Google 登入
      </button>
    </form>
  )
}
