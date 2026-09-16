// 單人版設定：沒有帳號設定頁，就把少數幾個常數收在這裡。
// 時區影響「今天」的判定（連續天數、每日目標），在台灣使用固定為台北。
export const TIMEZONE = 'Asia/Taipei'

export const NEW_LIMIT = 20
export const DUE_LIMIT = 100
/** 每輪從已精熟的字隨機抽考幾個，確認沒有悄悄忘掉。 */
export const SPOT_CHECK_LIMIT = 3
