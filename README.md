# 雅思單字

個人用的單字背誦工具。純靜態網站，進度存在自己的瀏覽器，零成本部署。

- **2,568 個單字**：雅思學術詞表 AWL 570 字（Coxhead，10 個 sublist）＋ 多益 1,998 字
- **FSRS 間隔重複排程**：依記憶曲線決定每個字下次該複習的時間
- **三階段題型**：選擇題 → 克漏字 → 拼寫，隨熟練度自動升級
- **沉浸閱讀**：37 篇短文（多益情境 + 伊索寓言），點字查釋義、收進生字本、練 Part 7 題型
- **離線可用**：PWA，可安裝到手機主畫面
- **零後端**：沒有帳號、沒有資料庫、沒有伺服器

## 開發

```bash
npm install
npm run dev            # http://localhost:3000
npm test               # 單元測試（含單字資料檢查：重複、缺例句、句子過長）
npm run check-content  # 單獨跑資料檢查（需 Node 22+）
```

## 部署到 Cloudflare Pages

```bash
npm run build          # 產出 out/
```

Cloudflare Pages 設定：

| 項目 | 值 |
|------|-----|
| Build command | `npm run build` |
| Build output directory | `out` |

不需要任何環境變數或繫結。

## 進度備份

學習進度存在瀏覽器的 localStorage，**只存在這台裝置**。
清除瀏覽器資料或換裝置就會消失，請到「學習數據」頁定期**匯出備份**（JSON），
換裝置時再匯入。

## 新增單字書

1. 在 `content/` 放一份 JSON，格式參考 `content/ielts-awl-1.json`
2. 在 `lib/content/static.ts` import 並加進 `RAW_BOOKS`
3. `npm test` 確認資料沒問題（會檢查重複字、缺例句、句子過長）

單字 id 由 `<bookSlug>:<headword>` 組成，所以改 headword 或 slug 會讓該字的複習進度歸零。
