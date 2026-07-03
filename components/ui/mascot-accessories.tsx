import type { ReactNode } from 'react'

export type EquippedShape = { head?: string | null; face?: string | null; neck?: string | null }

const INK = '#1A1A1A'

// key = catalog itemKey。配件相對於小橙狐臉部（ellipse cx60 cy62 rx40 ry36、眼 y54、耳頂 y8）。
export const ACCESSORY_SVG: Record<string, ReactNode> = {
  // ── head ──
  hat_party: (
    <>
      <polygon points="42,24 60,-2 78,24" fill="#7C5CFF" stroke={INK} strokeWidth="3.5" strokeLinejoin="round" />
      <circle cx="60" cy="-2" r="4" fill="#FFD23F" stroke={INK} strokeWidth="2" />
    </>
  ),
  hat_grad: (
    <>
      <polygon points="60,4 96,18 60,32 24,18" fill={INK} />
      <rect x="46" y="18" width="28" height="10" fill={INK} />
      <path d="M92 18 v12" stroke="#FFD23F" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="92" cy="31" r="3" fill="#FFD23F" />
    </>
  ),
  // ── face ── (eyes at x47/x73, y54)
  glasses_round: (
    <>
      <circle cx="47" cy="54" r="9" fill="none" stroke={INK} strokeWidth="3" />
      <circle cx="73" cy="54" r="9" fill="none" stroke={INK} strokeWidth="3" />
      <path d="M56 54 h8" stroke={INK} strokeWidth="3" strokeLinecap="round" />
    </>
  ),
  glasses_star: (
    <>
      <rect x="37" y="47" width="20" height="14" rx="4" fill={INK} />
      <rect x="63" y="47" width="20" height="14" rx="4" fill={INK} />
      <path d="M57 54 h6" stroke={INK} strokeWidth="3" strokeLinecap="round" />
      <text x="42" y="58" fontSize="9" fill="#FFD23F">★</text>
      <text x="68" y="58" fontSize="9" fill="#FFD23F">★</text>
    </>
  ),
  // ── neck ── (below face, ~y100)
  scarf_orange: (
    <path d="M32 98 q28 14 56 0 l0 9 q-28 14 -56 0 Z" fill="#FF8C42" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
  ),
  bowtie: (
    <>
      <polygon points="60,104 44,96 44,112" fill="#E23D5A" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
      <polygon points="60,104 76,96 76,112" fill="#E23D5A" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
      <circle cx="60" cy="104" r="4" fill={INK} />
    </>
  ),
}

const ORDER: Array<keyof EquippedShape> = ['neck', 'face', 'head']

export function accessoryLayerKeys(equipped?: EquippedShape): string[] {
  if (!equipped) return []
  return ORDER
    .map((slot) => equipped[slot])
    .filter((k): k is string => !!k && k in ACCESSORY_SVG)
}

export function AccessoryLayers({ equipped }: { equipped?: EquippedShape }): ReactNode {
  return <>{accessoryLayerKeys(equipped).map((k) => <g key={k}>{ACCESSORY_SVG[k]}</g>)}</>
}
