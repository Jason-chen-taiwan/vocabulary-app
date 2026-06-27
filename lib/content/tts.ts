export interface UtteranceConfig {
  text: string
  lang: string
  rate: number
}

export function buildUtterance(text: string, lang = 'en-US'): UtteranceConfig {
  return { text, lang, rate: 0.9 }
}
