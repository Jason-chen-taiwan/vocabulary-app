// 閱讀速度純前端統計顯示，不進排名
export function wpm(wordCount: number, readSeconds: number | null): number | null {
  if (readSeconds === null || readSeconds < 10) return null
  return Math.round(wordCount / (readSeconds / 60))
}

export function readSecondsBetween(startMs: number, endMs: number): number {
  return Math.max(0, Math.floor((endMs - startMs) / 1000))
}
