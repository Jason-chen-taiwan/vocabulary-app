// 解析 ECDICT 附帶的 BNC lemma.en.txt：每行「lemma/freq -> form1,form2」，';' 開頭為註解
export function parseLemmaFile(text: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith(';')) continue
    const arrow = trimmed.indexOf('->')
    if (arrow < 0) continue
    const lemma = trimmed.slice(0, arrow).split('/')[0].trim().toLowerCase()
    if (!lemma) continue
    for (const form of trimmed.slice(arrow + 2).split(',')) {
      const f = form.trim().toLowerCase()
      if (f && f !== lemma) map.set(f, lemma)
    }
  }
  return map
}

export function makeLemmaOf(map: Map<string, string>): (word: string) => string {
  return (word: string) => {
    const lower = word.toLowerCase()
    return map.get(lower) ?? lower
  }
}
