import { AccessoryLayers, type EquippedShape } from './mascot-accessories'

// 原創 SVG 吉祥物「小橙狐」。單一 SVG，依 mood 切換耳/眼/嘴/手勢部件，base 共用。
// 純表現、無業務依賴。顏色取自設計 tokens。
export const MASCOT_MOODS = ['hi', 'cheer', 'encourage', 'sad'] as const
export type MascotMood = (typeof MASCOT_MOODS)[number]

export function moodForHome(args: { goalMet: boolean; streak: number; longestStreak: number }): MascotMood {
  if (args.goalMet) return 'cheer'
  if (args.streak === 0 && args.longestStreak > 0) return 'sad'
  return 'hi'
}

export function moodForSessionEnd(args: { correct: number; total: number }): MascotMood {
  if (args.total > 0 && args.correct === args.total) return 'cheer'
  if (args.total > 0 && args.correct / args.total < 0.5) return 'encourage'
  return 'cheer'
}

const ORANGE = '#FF6A3D'
const INK = '#1A1A1A'
const MUZZLE = '#FFF7F2'
const LIGHT = '#FFB68F'

export function Mascot({ mood = 'hi', size = 120, className = '', equipped }: { mood?: MascotMood; size?: number; className?: string; equipped?: EquippedShape }) {
  const sad = mood === 'sad'
  return (
    <svg
      width={size}
      height={(size * 130) / 120}
      viewBox="0 0 120 130"
      fill="none"
      role="img"
      aria-label="小橙狐吉祥物"
      className={className}
    >
      {/* behind-face limbs */}
      {mood === 'hi' && (
        <path d="M86 78 q16 4 14 22" stroke={INK} strokeWidth="3.5" fill={ORANGE} strokeLinejoin="round" />
      )}
      {mood === 'cheer' && (
        <>
          <path d="M24 58 q-12 -14 -4 -28" stroke={INK} strokeWidth="3.5" fill={ORANGE} strokeLinejoin="round" />
          <path d="M96 58 q12 -14 4 -28" stroke={INK} strokeWidth="3.5" fill={ORANGE} strokeLinejoin="round" />
        </>
      )}

      {/* ears */}
      {sad ? (
        <>
          <path d="M28 44 Q15 30 30 14 Q31 33 50 35 Z" fill={ORANGE} stroke={INK} strokeWidth="3.5" strokeLinejoin="round" />
          <path d="M92 44 Q105 30 90 14 Q89 33 70 35 Z" fill={ORANGE} stroke={INK} strokeWidth="3.5" strokeLinejoin="round" />
        </>
      ) : (
        <>
          <polygon points="30,40 22,8 52,30" fill={ORANGE} stroke={INK} strokeWidth="3.5" strokeLinejoin="round" />
          <polygon points="90,40 98,8 68,30" fill={ORANGE} stroke={INK} strokeWidth="3.5" strokeLinejoin="round" />
          <polygon points="33,36 31,19 45,30" fill={LIGHT} />
          <polygon points="87,36 89,19 75,30" fill={LIGHT} />
        </>
      )}

      {/* face base (shared) */}
      <ellipse cx="60" cy="62" rx="40" ry="36" fill={ORANGE} stroke={INK} strokeWidth="3.5" />
      <ellipse cx="60" cy="78" rx="26" ry="16" fill={MUZZLE} />
      <ellipse cx="33" cy="69" rx="7" ry="5" fill={LIGHT} />
      <ellipse cx="87" cy="69" rx="7" ry="5" fill={LIGHT} />

      {/* eyes */}
      {mood === 'cheer' ? (
        <>
          <path d="M41 56 Q47 49 53 56" stroke={INK} strokeWidth="3.5" strokeLinecap="round" fill="none" />
          <path d="M67 56 Q73 49 79 56" stroke={INK} strokeWidth="3.5" strokeLinecap="round" fill="none" />
        </>
      ) : (
        <>
          <circle cx="47" cy="54" r="6" fill={INK} />
          <circle cx="73" cy="54" r="6" fill={INK} />
          <circle cx="49" cy="52" r="2" fill="#fff" />
          <circle cx="75" cy="52" r="2" fill="#fff" />
        </>
      )}

      {/* nose (shared) */}
      <ellipse cx="60" cy="71" rx="4.5" ry="3.5" fill={INK} />

      {/* mouth */}
      {mood === 'cheer' ? (
        <path d="M51 78 Q60 90 69 78 Z" fill={INK} />
      ) : sad ? (
        <path d="M52 84 Q60 78 68 84" stroke={INK} strokeWidth="3" strokeLinecap="round" fill="none" />
      ) : (
        <path d="M52 80 Q60 87 68 80" stroke={INK} strokeWidth="3" strokeLinecap="round" fill="none" />
      )}

      {/* front extras */}
      {mood === 'encourage' && (
        <>
          <path d="M90 72 q15 0 16 -12" stroke={INK} strokeWidth="3.5" fill={ORANGE} strokeLinejoin="round" />
          <circle cx="106" cy="54" r="7" fill={ORANGE} stroke={INK} strokeWidth="3" />
          <path d="M106 47 v-6" stroke={INK} strokeWidth="3" strokeLinecap="round" />
        </>
      )}
      {mood === 'cheer' && (
        <>
          <text x="14" y="26" fontSize="16">✨</text>
          <text x="94" y="22" fontSize="13">✨</text>
        </>
      )}
      {mood === 'sad' && (
        <path d="M84 66 q4 7 0 11 q-4 -4 0 -11 Z" fill="#2BB3C0" stroke={INK} strokeWidth="1.5" />
      )}
      <AccessoryLayers equipped={equipped} />
    </svg>
  )
}
