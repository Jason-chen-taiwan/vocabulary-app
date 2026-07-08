'use client'

import { signIn } from 'next-auth/react'

// ponytail: client signIn, not the server-action form. The server-action signIn()
// breaks under OpenNext/Workers (UnknownAction -> error=Configuration). Client signIn
// fetches CSRF + POSTs to /api/auth/signin/google in the browser — the path that works.
export function SignInButton() {
  return (
    <button
      type="button"
      onClick={() => signIn('google', { callbackUrl: '/' })}
      className="inline-flex min-h-11 items-center justify-center rounded-control border-2 border-primary-200 bg-surface px-5 py-3 font-bold text-neutral-900 shadow-[0_6px_14px_rgba(255,106,61,.15)] transition hover:bg-primary-50"
    >
      使用 Google 登入
    </button>
  )
}
