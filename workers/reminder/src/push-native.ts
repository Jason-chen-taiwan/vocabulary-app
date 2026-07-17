// Fallback push sender using only Web Crypto (crypto.subtle) — no `web-push`,
// no Node crypto. Use this if `web-push` fails to run under workerd.
//
// It sends a PAYLOAD-LESS ("tickle") push: just VAPID-authenticated headers,
// no encrypted body. The service worker's push handler already shows the full
// reminder from its hardcoded defaults when `event.data` is absent, so we do
// NOT need the aes128gcm payload-encryption path (ECDH + HKDF + AES-GCM) at
// all — only the VAPID JWT (ES256), which crypto.subtle signs natively.
//
// ponytail: bodyless push on purpose. If per-user notification text is ever
// needed, add aes128gcm encryption here (that's the big addition, not this).

import type { Sub } from './reminders'
import type { Vapid } from './push'

function b64urlToBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/')
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob(b64 + pad)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

function bytesToB64url(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function strToB64url(s: string): string {
  return bytesToB64url(new TextEncoder().encode(s))
}

// Import the VAPID keypair (url-base64 raw P-256: 65-byte public 0x04||X||Y,
// 32-byte private scalar d) as an ES256 signing key via JWK.
async function importVapidKey(vapid: Vapid): Promise<CryptoKey> {
  const pub = b64urlToBytes(vapid.publicKey) // 0x04 || X(32) || Y(32)
  const d = vapid.privateKey
  const x = bytesToB64url(pub.slice(1, 33))
  const y = bytesToB64url(pub.slice(33, 65))
  return crypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', x, y, d, ext: true },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  )
}

// Build the VAPID Authorization header value for a push endpoint's origin.
async function vapidAuthHeader(endpoint: string, vapid: Vapid): Promise<string> {
  const aud = new URL(endpoint).origin
  const exp = Math.floor(Date.now() / 1000) + 12 * 3600 // <24h per spec
  const header = strToB64url(JSON.stringify({ typ: 'JWT', alg: 'ES256' }))
  const body = strToB64url(JSON.stringify({ aud, exp, sub: vapid.subject }))
  const signingInput = `${header}.${body}`

  const key = await importVapidKey(vapid)
  const sig = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      new TextEncoder().encode(signingInput)
    )
  )
  // crypto.subtle already returns the JOSE raw r||s (64 bytes) — no DER unwrap.
  const jwt = `${signingInput}.${bytesToB64url(sig)}`
  return `vapid t=${jwt}, k=${vapid.publicKey}`
}

// Same signature/contract as push.ts sendPush: returns the push service HTTP
// status (201 delivered; 410/404 = gone → caller prunes).
export async function sendPush(sub: Sub, vapid: Vapid): Promise<{ status: number }> {
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuthHeader(sub.endpoint, vapid),
      TTL: '86400',
      // No body → no Content-Encoding. Push services accept an empty push.
    },
  })
  return { status: res.status }
}
