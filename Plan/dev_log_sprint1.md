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

## 📅 2026-05-07: 應用場景模板 (Scene Templates) 與 UI 互動機制優化

### 🚀 應用場景模板實作
- **場景定義 (`scenes.js`)**：定義了鐵路車載 (EN 50155)、電力系統 (IEC 61850)、智慧工廠 (PoE) 與港口海事 (IEC 60945) 四大模板。
- **條件分級機制**：實作「必選 (Required)」與「建議 (Suggested)」雙層條件。必選條件預設鎖定，建議條件則以橘色標籤呈現並允許使用者手動移除。
- **一鍵清除與還原**：新增 `clearScene` 與 `restoreScene` 功能，確保模板與手動篩選模式能無縫切換。

### 🎨 UI/UX 互動性提升
- **情境修改偵測 (Modified State)**：實作自動偵測邏輯。若使用者手動調整了場景預設值，按鈕會變為「橘色（已修改）」狀態，並顯示「恢復預設」按鈕。
- **智能標籤系統 (Dynamic Tags)**：
    - **狀態提示**：手動修改過的模板條件會標記為 `⚠ (已改)`。
    - **手動補償**：在場景模式下，若手動選擇非模板條件，系統會以綠色標籤補入 Filter Conditions。
- **CSS 視覺強化**：加入 Glassmorphism 風格的場景按鈕，以及針對不同狀態的專屬顏色識別。

### ⚙️ 後端篩選邏輯優化
- **管理類型模糊比對 (Regex Matching)**：針對 `Management Type` 改用正規表達式查詢，解決資料庫中 "Managed" 與 "Unmanaged" 字串大小寫不一的問題。
- **硬體特徵標籤預處理**：重構標籤生成邏輯，保留 Key 的原始大小寫，確保 `PoE`、`Fiber`、`RJ-45` 等縮寫能正確顯示。

---

---

## 📅 2026-05-15：進階功能選擇器 (Feature Selector) 建置

### 🎯 設計決策

**痛點**：原有的 Search Inventory 搜尋框雖支援模糊搜尋，但使用者需要知道確切的功能名稱才能搜尋，對不熟悉規格的使用者（如業務、PM）造成認知負擔。

**決策：混合式架構（人工大分類 + 動態子功能）**
- 大分類（Group 卡片）：由 PM/RD 在 `FS_GROUPS` 中人工維護，提供語意清晰的分類結構。
- 子功能清單：由後端 DB 自動掃描產生，新增功能無需改程式碼。
- 若 DB 出現未被歸類的 category，自動歸入「其他（未分類）」，不會崩潰，但會提示 PM 更新設定。

**Modal 整合而非獨立頁面**：嵌入主頁的 Modal 模式，保留使用者已選的其他篩選條件，不需頁面切換。

---

### 🗂️ 新增檔案

| 檔案 | 說明 |
|------|------|
| `frontend/css/feature-selector.css` | Modal 外框、分類卡片、子功能列表、Chip 列等所有樣式，使用主頁 CSS 變數保持設計一致 |
| `frontend/js/feature-selector.js` | 完整選擇器邏輯（詳見下方），不含任何 DOM 直接操作在 HTML 中 |

---

### ⚙️ 後端修改：`app/api/selection.py`

- **`searchProdType` 空白查詢支援**：查詢字串為空時，直接回傳完整的 `SEARCHABLE_ITEMS` 列表（不限制 20 筆），供 Feature Selector 一次性初始化，之後完全由前端過濾，不再觸發 API。

---

### 🎨 前端架構：`frontend/js/feature-selector.js`

**三層可維護設計**（由上往下，修改頻率遞減）：

1. **`FS_GROUPS`（人工維護區）**：定義 10 個大分類卡片，每個包含 `id / label / icon / color / dbCategories`。`dbCategories` 字串需與 DB 的 category 欄位**完全一致**（可透過 `GET /api/searchProdType?q=` 查詢）。

2. **`FS_HIDDEN_FEATURES`（隱藏功能設定）**：`Set<string>`，放入 DB key（格式：`category|||feat_key`）即可讓該功能不出現在 UI，但仍可透過 Search Inventory 找到。隱藏只影響前端，不影響資料庫與查詢結果。

3. **邏輯函數區（一般不需修改）**：`_fsDistributeItems`（分配資料到各 Group）、`fsRender / fsRenderGrid / fsRenderSub / fsRenderChips / fsRenderSearch`（渲染函數）、`fsToggleItem / fsToggleCat / fsToggleCard`（互動函數）。

**與主頁橋接（`app.js`）**：
- `openFeatureSelector()` / `closeFeatureSelector()` / `fsReset()`：Modal 控制。
- `applyFeatureSelector()`：呼叫 `fsGetSelected()` 取得選取結果，注入 `selectedItemsMap`，並呼叫 `renderSelected()` 更新主頁 UI。

---

### 🐛 Bug 修正

| # | 問題描述 | 根因 | 修正方式 |
|---|----------|------|---------|
| 1 | 89 項功能歸入「其他（未分類）」 | `FS_GROUPS.dbCategories` 字串與 DB 實際 category 名稱不符（如 `'ACL'` vs `'Access Control List (ACL)'`、`'ERPS'` vs `'ERPS(G.8032)'`） | 執行 `python -c "...SEARCHABLE_ITEMS"` 取得精確 category 名稱，逐一修正 8 個錯誤，補入 15 個遺漏 category |
| 2 | Reset All 不清除 Feature Selector 選取 | `resetAll()` 只清除 `selectedItemsMap`，未呼叫 Feature Selector 的狀態重置 | 在 `feature-selector.js` 新增 `fsReset()`，並在 `app.js` 的 `resetAll()` 中加入呼叫 |
| 3 | 刪除 Chip 後 checkbox 仍顯示勾選 | `fsRemoveCatChip()` 只呼叫 `fsRenderChips()`，未重渲染子功能面板 | 改呼叫 `fsRender()`（完整重渲染） |

---

### 📋 維護手冊（快速參考）

```
新增子功能        → 不需改任何程式碼（DB 自動同步）
新增 DB 大分類    → FS_GROUPS[x].dbCategories 加一行（需完全符合 DB category 字串）
新增 Group 卡片   → FS_GROUPS 陣列加一個 object
隱藏特定子功能    → FS_HIDDEN_FEATURES Set 加一行 'category|||feat_key'
恢復隱藏的功能    → FS_HIDDEN_FEATURES Set 刪除對應行
```

---

## 📈 下一階段計畫 (Sprint 2)
- [ ] 實作真正的 RAG (Retrieval-Augmented Generation) 流程。
- [ ] 整合向量資料庫（Vector DB）處理 PDF 規格書文本。
- [ ] 開發自動生成 Word/PDF 產品選型報告的功能。
- [ ] 增加對比功能，讓使用者能橫向比較多台設備的細節。
