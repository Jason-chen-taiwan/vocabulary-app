import type {
  PassageFile, PassageData, PassagePayload, PassageListItem, PassageQuestion, GlossEntry,
} from './types'
import { listAllWords } from '@/lib/content/static'

// 靜態閱讀內容：直接 import JSON，取代 PassageRepository（Prisma）。
// content/passages/*.json 是建置產物（scripts/build-passage.mjs 產生），本身就自帶
// 內文、glossary 與題目，所以單人靜態版不需要任何 DB。
import p_office_supply_memo from '@/content/passages/office-supply-memo.json'
import p_story_ants_and_grasshopper from '@/content/passages/story-ants-and-grasshopper.json'
import p_story_boy_who_cried_wolf from '@/content/passages/story-boy-who-cried-wolf.json'
import p_story_fox_and_grapes from '@/content/passages/story-fox-and-grapes.json'
import p_story_lion_and_mouse from '@/content/passages/story-lion-and-mouse.json'
import p_story_north_wind_and_sun from '@/content/passages/story-north-wind-and-sun.json'
import p_story_tortoise_and_hare from '@/content/passages/story-tortoise-and-hare.json'
import p_toeic_banking_savings_promotion from '@/content/passages/toeic-banking-savings-promotion.json'
import p_toeic_banking_wire_transfer from '@/content/passages/toeic-banking-wire-transfer.json'
import p_toeic_contracts_service_amendment from '@/content/passages/toeic-contracts-service-amendment.json'
import p_toeic_contracts_termination_notice from '@/content/passages/toeic-contracts-termination-notice.json'
import p_toeic_finance_audit_notice from '@/content/passages/toeic-finance-audit-notice.json'
import p_toeic_finance_investment_letter from '@/content/passages/toeic-finance-investment-letter.json'
import p_toeic_finance_quarterly_earnings from '@/content/passages/toeic-finance-quarterly-earnings.json'
import p_toeic_hr_job_posting from '@/content/passages/toeic-hr-job-posting.json'
import p_toeic_hr_performance_review from '@/content/passages/toeic-hr-performance-review.json'
import p_toeic_logistics_delivery_schedule from '@/content/passages/toeic-logistics-delivery-schedule.json'
import p_toeic_logistics_dock_notice from '@/content/passages/toeic-logistics-dock-notice.json'
import p_toeic_logistics_supplier_shortage from '@/content/passages/toeic-logistics-supplier-shortage.json'
import p_toeic_marketing_newsletter_survey from '@/content/passages/toeic-marketing-newsletter-survey.json'
import p_toeic_marketing_product_launch from '@/content/passages/toeic-marketing-product-launch.json'
import p_toeic_meetings_memo_webinar from '@/content/passages/toeic-meetings-memo-webinar.json'
import p_toeic_meetings_notice_agenda from '@/content/passages/toeic-meetings-notice-agenda.json'
import p_toeic_office_email_reply from '@/content/passages/toeic-office-email-reply.json'
import p_toeic_office_memo_reorganization from '@/content/passages/toeic-office-memo-reorganization.json'
import p_toeic_office_printer_notice from '@/content/passages/toeic-office-printer-notice.json'
import p_toeic_safety_chemical_handling from '@/content/passages/toeic-safety-chemical-handling.json'
import p_toeic_safety_fire_bulletin from '@/content/passages/toeic-safety-fire-bulletin.json'
import p_toeic_safety_wet_floor_memo from '@/content/passages/toeic-safety-wet-floor-memo.json'
import p_toeic_service_hotline_support from '@/content/passages/toeic-service-hotline-support.json'
import p_toeic_service_refund_policy from '@/content/passages/toeic-service-refund-policy.json'
import p_toeic_service_satisfaction_survey from '@/content/passages/toeic-service-satisfaction-survey.json'
import p_toeic_tech_app_release_note from '@/content/passages/toeic-tech-app-release-note.json'
import p_toeic_tech_system_outage from '@/content/passages/toeic-tech-system-outage.json'
import p_toeic_travel_hotel_ad from '@/content/passages/toeic-travel-hotel-ad.json'
import p_toeic_travel_itinerary from '@/content/passages/toeic-travel-itinerary.json'
import p_toeic_travel_letter from '@/content/passages/toeic-travel-letter.json'

const FILES: PassageFile[] = [
p_office_supply_memo,
  p_story_ants_and_grasshopper,
  p_story_boy_who_cried_wolf,
  p_story_fox_and_grapes,
  p_story_lion_and_mouse,
  p_story_north_wind_and_sun,
  p_story_tortoise_and_hare,
  p_toeic_banking_savings_promotion,
  p_toeic_banking_wire_transfer,
  p_toeic_contracts_service_amendment,
  p_toeic_contracts_termination_notice,
  p_toeic_finance_audit_notice,
  p_toeic_finance_investment_letter,
  p_toeic_finance_quarterly_earnings,
  p_toeic_hr_job_posting,
  p_toeic_hr_performance_review,
  p_toeic_logistics_delivery_schedule,
  p_toeic_logistics_dock_notice,
  p_toeic_logistics_supplier_shortage,
  p_toeic_marketing_newsletter_survey,
  p_toeic_marketing_product_launch,
  p_toeic_meetings_memo_webinar,
  p_toeic_meetings_notice_agenda,
  p_toeic_office_email_reply,
  p_toeic_office_memo_reorganization,
  p_toeic_office_printer_notice,
  p_toeic_safety_chemical_handling,
  p_toeic_safety_fire_bulletin,
  p_toeic_safety_wet_floor_memo,
  p_toeic_service_hotline_support,
  p_toeic_service_refund_policy,
  p_toeic_service_satisfaction_survey,
  p_toeic_tech_app_release_note,
  p_toeic_tech_system_outage,
  p_toeic_travel_hotel_ad,
  p_toeic_travel_itinerary,
  p_toeic_travel_letter,
] as PassageFile[]

// headword（小寫）→ 精修字庫的字。原本 seed-passages.mjs 進 DB 時做這件事，
// 靜態版沒有 seed 步驟，改在模組載入時解析一次。
const CURATED_BY_HEADWORD = new Map(
  listAllWords().map((w) => [w.headword.toLowerCase(), w]),
)

/**
 * 把 `curated: true` 換成實際 wordId，並以精修釋義覆蓋 glossary。
 * 覆蓋是必要的：glossary 的 zh 來自 ECDICT 首義，常選錯詞義（例：net → 網），
 * 精修字庫的定義才是對的。原本這步在 seed 時做，現在改在載入時做。
 */
function resolveGlossary(glossary: Record<string, GlossEntry>): Record<string, GlossEntry> {
  const out: Record<string, GlossEntry> = {}
  for (const [lemma, entry] of Object.entries(glossary)) {
    if (!entry.curated) { out[lemma] = entry; continue }
    const word = CURATED_BY_HEADWORD.get(lemma)
    if (!word) {
      // 查不到就退回純 gloss 呈現（拿掉 curated 旗標，避免前端誤判）
      const { curated: _curated, ...rest } = entry
      out[lemma] = rest
      continue
    }
    const resolved: GlossEntry = { zh: word.definitionZh, wordId: word.id }
    if (word.partOfSpeech) resolved.pos = word.partOfSpeech
    out[lemma] = resolved
  }
  return out
}

/** 靜態版沒有 DB 自動編號，slug 本身就是唯一鍵，直接當 id。 */
function toData(f: PassageFile): PassageData {
  return {
    id: f.slug,
    slug: f.slug,
    kind: f.kind,
    title: f.title,
    titleZh: f.titleZh ?? null,
    level: f.level ?? null,
    topic: f.topic ?? null,
    source: f.source,
    wordCount: f.wordCount,
    content: f.content,
    glossary: resolveGlossary(f.glossary),
    questions: f.questions,
  }
}

// 先多益（依 topic）再故事，跟原本列表頁的順序一致。
const PASSAGES: PassageData[] = FILES.map(toData).sort((a, b) => {
  if (a.kind !== b.kind) return a.kind === 'toeic' ? -1 : 1
  return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0
})

const BY_SLUG = new Map(PASSAGES.map((p) => [p.slug, p]))

export function listPassages(): PassageListItem[] {
  return PASSAGES.map((p) => ({
    id: p.id, slug: p.slug, kind: p.kind, title: p.title, titleZh: p.titleZh,
    level: p.level, topic: p.topic, wordCount: p.wordCount, questionCount: p.questions.length,
  }))
}

export function getPassageBySlug(slug: string): PassageData | null {
  return BY_SLUG.get(slug) ?? null
}

/**
 * 前端 payload。原本後端會剝掉 answer 防作弊；單人靜態版沒有排名也沒有共享狀態，
 * 答案本來就在使用者自己的瀏覽器裡（作弊只是騙自己），因此改為前端自行判題。
 * 仍保留 PassagePayload 型別，讓 reader 元件不必改動介面。
 */
export function toPassagePayload(p: PassageData): PassagePayload {
  return { ...p, questions: p.questions.map(({ answer: _answer, ...q }) => q) }
}

/** 前端判題用：取得某篇的正解索引。 */
export function answerKey(slug: string): number[] {
  return (BY_SLUG.get(slug)?.questions ?? []).map((q: PassageQuestion) => q.answer)
}
