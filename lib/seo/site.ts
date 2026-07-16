// 與 app/layout.tsx 的 metadataBase 同值；改網域兩處都要改。
export const SITE_URL = 'https://0stack.org'

// sitemap 條目（純函式，方便測試；app/sitemap.ts 只負責取資料）。
export function buildSitemapEntries(headwords: string[]): { url: string; priority: number }[] {
  return [
    { url: `${SITE_URL}/`, priority: 1 },
    ...headwords.map((hw) => ({ url: `${SITE_URL}/word/${encodeURIComponent(hw)}`, priority: 0.6 })),
  ]
}
