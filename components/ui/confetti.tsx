// 裝飾性彩帶/星點，用於慶祝畫面背景。aria-hidden，純呈現。
export function Confetti({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 80" width="200" height="80" fill="none" aria-hidden className={className}>
      <rect x="18" y="14" width="8" height="14" rx="2" fill="#FF6A3D" transform="rotate(-18 22 21)" />
      <rect x="170" y="10" width="8" height="14" rx="2" fill="#7C5CFC" transform="rotate(20 174 17)" />
      <circle cx="50" cy="10" r="4" fill="#F5B301" />
      <circle cx="150" cy="30" r="4" fill="#22A06B" />
      <path d="M96 6 l3 6 l6 1 l-4.5 4 l1 6 l-5.5 -3 l-5.5 3 l1 -6 l-4.5 -4 l6 -1 Z" fill="#F5B301" />
      <rect x="120" y="16" width="7" height="12" rx="2" fill="#2BB3C0" transform="rotate(-25 123 22)" />
      <circle cx="78" cy="34" r="3.5" fill="#FF6A3D" />
    </svg>
  )
}
