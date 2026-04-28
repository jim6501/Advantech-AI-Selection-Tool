# 📝 Development Log - Sprint 1 (Stage 1)

這個文件記錄了 Advantech AI Selection Tool 第一階段開發過程中的關鍵里程碑與技術決策。

## 📅 2026-04-21: 第一階段完工與文件化

### 🚀 系統核心架構 (Backend & Infra)
- **FastAPI 整合開發**：建立統一的後端進入點，整合搜尋、篩選與 AI 對話 API。
- **MongoDB 動態特徵掃描**：實現資料驅動（Data-Driven）設計，系統會自動掃描 `product_specs` 中的 200+ 項軟硬體特徵，無需手動維護功能清單。
- **三態值邏輯優化**：定義 `full`, `optional`, `no` 的比對邏輯，並根據需求將 `in_development` (開發中) 項目從預設搜尋結果中排除，提升資料精確度。

### 🔄 資料工程與同步 (Data Engineering)
- **Google Sheets 同步管線**：開發 `fetch_hardware_specs` 與 `fetch_sw_specs` 腳本，解決 Excel 轉 JSON 過程中的合併儲存格 (Forward-fill) 與欄位清理問題。
- **雙軌 Join 邏輯**：實現 `sync_specs_to_mongo.py`，根據 Product PN 自動配對硬體規格與對應系列的軟體功能，並具備自動推導系列的能力。
- **欄位修正**：解決 PoE 分類欄位名稱不一（如 `PoE RJ-45 100M` vs `PoE (D-code)`）導致連鎖搜尋失敗的問題。

### 🎨 前端開發與 UX 優化 (Frontend & UX)
- **Glassmorphism 視覺設計**：使用現代化 HSL 配色與毛玻璃質感，打造 Premium 等級的工業選型介面。
- **智慧搜尋框 (Search Inventory)**：
    - 支援大小寫不敏感的模糊搜尋。
    - 解決搜尋限制 (Limit 20) 的問題，改為優先顯示「開頭匹配」的關鍵字。
- **衝突項視覺提醒**：當使用者選取的條件無結果時，介面會以紅色標示出「造成無結果的可能衝突項 (Culprit Items)」，大幅降低使用者的挫折感。

### 🤖 AI 與互動整合 (AI Interaction)
- **上下文感知 (Context Awareness)**：開發 AI 鎖定功能，讓 Chatbot 能自動讀取目前篩選出的型號列表進行比較分析。
- **可收縮型號列表**：針對多型號鎖定場景，開發了 `▼ +N 更多` 的收納機制，解決型號過多導致按鈕被推到視窗外的 UI 問題。

---

## 📅 2026-04-28: RAG Chatbot 第一階段 (Phase 1) 建置與效能優化

### 🤖 RAG 3-Stage Pipeline (Backend)
- **意圖解析 (Stage 1)**：實作 `intent_parser.py`，利用 Gemini 2.5 Flash 精準從自然語言抽出結構化條件。解除 Prompt 長度限制，並支援模糊比對與「分類名稱 (Category)」直接匹配。
- **資料庫篩選 (Stage 2)**：實作 `hard_filter.py`，動態將抽取出的 JSON 意圖轉換為 MongoDB 查詢條件。支援自動展開軟體分類（如 IEC 61850 自動關聯至 GOOSE/MMS 功能）。
- **報告生成 (Stage 5)**：實作 `report_generator.py`，總結前 15 筆型號規格並輸出高可讀性的 Markdown 規格比較與推薦。

### 🛡️ 系統穩定度與架構優化
- **LLM Gateway**：建立統一呼叫層 `llm_gateway.py`，加入自動化 Retry、RPM (10) 限流保護、防呆 JSON 解析，以及 API 用量紀錄 (`llm_usage.log`)。
- **FastAPI 阻塞修復 (Non-blocking)**：修正 `async def` 搭配同步 LLM 請求導致的事件迴圈阻塞問題，改為使用 FastAPI 內建的 Thread Pool 處理，確保 Chatbot 思考時前端介面的模糊搜尋仍能保持「毫秒級」即時反應。
- **SDK 升級**：全面遷移至最新版 `google-genai` SDK，並將預設模型配置為可用的 `gemini-2.5-flash`。

### 🎨 前端與 UI/UX 升級
- **模組化重構**：將單一巨大的 HTML 檔案拆分為獨立的 `HTML`、`CSS` 與 `JS` 模組，大幅提升專案維護性。
- **參考型號收合面板**：Chatbot 回答新增「📄 參考型號」折疊區塊，使用 Chip 標籤整齊顯示所有符合的 PN，避免大量型號佔用過多畫面空間。
- **Application 條件野放**：修改 `selection.py`，於伺服器啟動時「動態」掃描所有硬體應用場景（如 Train, Substation），並自動將其加入前端模糊搜尋下拉清單中，徹底落實 Data-Driven 體驗。

---

## 📈 下一階段計畫 (Sprint 2)
- [ ] 實作真正的 RAG (Retrieval-Augmented Generation) 流程。
- [ ] 整合向量資料庫（Vector DB）處理 PDF 規格書文本。
- [ ] 開發自動生成 Word/PDF 產品選型報告的功能。
- [ ] 增加對比功能，讓使用者能橫向比較多台設備的細節。
