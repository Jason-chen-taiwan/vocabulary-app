export interface DictRow { word: string; pos: string; translation: string }

// 最小 CSV 行解析：處理雙引號欄位與 "" 跳脫（ECDICT 換行以字面 \n 存放，逐行解析安全）
export function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++ } else inQuotes = false
      } else cur += ch
    } else if (ch === '"') inQuotes = true
    else if (ch === ',') { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out
}

// 掃整份 csv 但只收 needed 的 lemma（66MB 檔全收會爆記憶體）
export function buildDictIndex(csvText: string, needed: Set<string>): Map<string, DictRow> {
  const idx = new Map<string, DictRow>()
  const lines = csvText.split('\n')
  for (let i = 1; i < lines.length; i++) { // 跳過表頭
    const line = lines[i]
    if (!line) continue
    const comma = line.indexOf(',')
    if (comma < 0) continue
    // 先便宜取 word 欄避免整行解析
    const head = line.startsWith('"') ? null : line.slice(0, comma).toLowerCase()
    if (head !== null && !needed.has(head)) continue
    const cols = parseCsvLine(line)
    const word = cols[0].toLowerCase()
    if (!needed.has(word) || idx.has(word)) continue
    idx.set(word, { word, pos: cols[4] ?? '', translation: cols[3] ?? '' })
  }
  return idx
}

// 從 ECDICT translation 抽短對譯：多義以字面 \n 分隔，取第一義；
// 剝前導詞性標記（如 "v. "）為 pos；在「,，;；、」截斷取第一片段；經注入的繁化函式輸出
export function glossFromTranslation(
  translation: string,
  toTraditional: (s: string) => string,
): { zh: string; pos?: string } | null {
  const first = translation.split('\\n')[0]?.trim()
  if (!first) return null
  const m = first.match(/^([a-z]+\.)\s*(.*)$/)
  const pos = m ? m[1] : undefined
  const body = (m ? m[2] : first).trim()
  const zh = toTraditional(body.split(/[,，;；、]/)[0].trim())
  if (!zh) return null
  return pos ? { zh, pos } : { zh }
}
