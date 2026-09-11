import { readFileSync, readdirSync } from 'node:fs'
import { checkContent } from '../lib/content/check-content.ts'

const files = readdirSync('content').filter((f) => (f.startsWith('toeic-') || f.startsWith('ielts-')) && f.endsWith('.json'))
const books = files.map((f) => JSON.parse(readFileSync(`content/${f}`, 'utf8')))
const problems = checkContent(books)
if (problems.length) {
  console.error(`Found ${problems.length} content problem(s):`)
  for (const p of problems) console.error(' -', p)
  process.exit(1)
}
console.log(`OK: ${books.length} books, ${books.reduce((n, b) => n + b.words.length, 0)} words, no problems.`)
