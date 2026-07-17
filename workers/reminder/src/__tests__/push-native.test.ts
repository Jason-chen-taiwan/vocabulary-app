import { describe, it, expect, vi } from 'vitest'
import { sendPush } from '../push-native'
import type { Vapid } from '../push'

// Generate a real P-256 keypair and export it in the url-base64 raw form that
// `web-push generate-vapid-keys` produces, so the test exercises the exact
// import path importVapidKey uses.
async function makeVapid(): Promise<{ vapid: Vapid; publicKey: CryptoKey }> {
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  )
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)) // 0x04||X||Y
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey)
  const b64url = (bytes: Uint8Array) => {
    let s = ''
    for (const b of bytes) s += String.fromCharCode(b)
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  }
  return {
    vapid: { publicKey: b64url(raw), privateKey: jwk.d as string, subject: 'mailto:t@e.st' },
    publicKey: pair.publicKey,
  }
}

function b64urlToBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/')
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob(b64 + pad)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

describe('push-native sendPush', () => {
  const sub = { endpoint: 'https://push.example.com/abc', p256dh: 'k', auth: 'a' }

  it('POSTs a bodyless push with a verifiable ES256 VAPID JWT and returns the status', async () => {
    const { vapid, publicKey } = await makeVapid()
    let captured: { url: string; init: RequestInit } | null = null
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      captured = { url, init }
      return { status: 201 } as Response
    })
    vi.stubGlobal('fetch', fetchMock)

    const res = await sendPush(sub, vapid)
    expect(res.status).toBe(201)

    expect(captured!.url).toBe(sub.endpoint)
    expect(captured!.init.method).toBe('POST')
    expect(captured!.init.body).toBeUndefined() // bodyless tickle

    const headers = captured!.init.headers as Record<string, string>
    expect(headers.TTL).toBe('86400')
    const auth = headers.Authorization
    expect(auth.startsWith('vapid t=')).toBe(true)

    // Extract the JWT and verify signature + claims against the public key.
    const jwt = auth.slice('vapid t='.length, auth.indexOf(', k='))
    const [h, b, sig] = jwt.split('.')
    const ok = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      b64urlToBytes(sig).buffer as ArrayBuffer,
      new TextEncoder().encode(`${h}.${b}`)
    )
    expect(ok).toBe(true)

    const claims = JSON.parse(new TextDecoder().decode(b64urlToBytes(b)))
    expect(claims.aud).toBe('https://push.example.com')
    expect(claims.sub).toBe('mailto:t@e.st')
    expect(claims.exp).toBeGreaterThan(0)

    vi.unstubAllGlobals()
  })

  it('propagates a 410 Gone status for the caller to prune', async () => {
    const { vapid } = await makeVapid()
    vi.stubGlobal('fetch', vi.fn(async () => ({ status: 410 }) as Response))
    const res = await sendPush(sub, vapid)
    expect(res.status).toBe(410)
    vi.unstubAllGlobals()
  })
})
