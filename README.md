# 🤖 Advantech Industrial Switch AI Selection Tool

這是一個專為 Advantech 工業交換機設計的智慧型選型工具。結合了**條件式篩選**與 **RAG (Retrieval-Augmented Generation) AI 助手**，協助使用者從數百種型號中精確找出符合需求的產品。

## 🌟 核心功能 (第一階段完成)

### 1. 智慧選型介面
- **多維度篩選**：支援管理型/非管理型、埠數 (Port Numbers) 以及多項硬體特徵篩選。
- **動態關鍵字搜尋**：即時比對資料庫中超過 200 項軟硬體功能特徵（如 Private VLAN, PoE+, ERPS 等）。
- **即時回傳**：直接對接 MongoDB 進行高效查詢，即時顯示詳細規格表。
- **篩選衝突提醒**：當組合條件導致無結果時，系統會自動標示「可能的衝突項」，協助使用者調整參數。

### 2. AI 選型助手 (Stage 1 Beta)
- **上下文鎖定**：AI 會自動感知使用者目前篩選出的型號清單，進行針對性分析。
- **型號收納功能**：支援型號列出時的展開/收起功能，保持介面整潔。
- **快速提問**：內建常用場景（電力、交通、PoE 規格等）快速入口。

### 3. SFP 光纖模組選型面板 (SFP Selector)
- **自動速度判定**：依產品規格動態推薦 100M/1G/10G 適用 SFP 模組清單，並標記 Combo 埠排他警告。
- **固定接頭支援**：針對固定光纖埠（如 SC/ST 接頭、多模/單模光纖）顯示對應選線與跳線建議，無需手動查詢。
- **捷徑快速跳轉**：卡片上新增 SFP 快捷 Badge，點擊即可直接切換至 SFP 選型頁籤。

### 4. 場景驗證與引導
- **✓ 場景驗證**：產品 Application 欄位若與套用的場景模板關鍵字匹配，卡片會動態亮起驗證徽章。
- **應用場景分組**：Feature Selector 中新增獨立的「應用場景」分組，提供更直觀的場景引導。

### 5. 官方產品與 SFP 連結導流
- **雙路徑官網導流**：於結果頁的產品卡片型號旁新增 `↗` 連結圖示，並在卡片展開底部新增明顯的「前往研華產品頁 →」CTA 按鈕。
- **SFP 模組即時跳轉**：SFP 選型面板內之推薦模組轉換為獨立點擊連結，一鍵開新分頁直達搜尋頁面。
- **URL 自動建構與 Fallback 策略**：後端新增 `prod_url` 欄位；前端會優先讀取此欄位，若空白則會以產品型號自動組出研華官網搜尋 URL。

### 6. 多台產品規格比對 (Product Comparison)
- **側拉對比面板**：支援勾選 1 至 5 台產品進行橫向規格對比。
- **差異高亮機制**：自動比對每一項規格，並以橘黃色背景高亮不同設備之間的規格差異，方便快速評估。
- **排序與電源篩選**：支援依型號/埠數進行結果排序，並新增電源輸入（DC/AC/電壓）條件過濾。

### 7. 多格式規格報表下載 (PDF/CSV Export)
- **多格式匯出**：對比面板內整合了報表匯出按鈕，支援前端生成 CSV 表格，以及呼叫後端 API 動態產出 PDF 規格書報表。
- **單台與多台支援**：取消先前必須勾選至少 2 台才能進入對比與匯出的限制，單台設備亦能順利匯出 PDF 與 CSV。

### 8. 已選條件與篩選器狀態雙向同步 (Filter & Selection Sync)
- **資料狀態一致性**：當使用者在主畫面點選 `✖` 移除已選特徵時，系統會自動清除進階功能選擇器（Feature Selector）內部勾選狀態（`fsSelected`）並即時重繪選型介面，避免兩者狀態不一致。

## 🌐 部署架構

本工具採用「前端公開 + 後端內網」的混合部署模式：

```
瀏覽器 → GitHub Pages（靜態前端）
              ↓ API 呼叫
    https://api.namecheapest.cc（Cloudflare Tunnel 公開 URL）
              ↓ 加密隧道
    內部電腦 FastAPI :8000 → MongoDB（本機）
```

| 入口 | 網址 | 說明 |
|------|------|------|
| GitHub Pages | `https://jim6501.github.io/Advantech-AI-Selection-Tool/` | 靜態前端，對外公開 |
| Cloudflare Tunnel | `https://api.namecheapest.cc` | 後端 API + 完整前端介面 |
| 本機開發 | `http://localhost:8000` | 本機直接存取 |

### Cloudflare Tunnel 啟動方式
```bash
cloudflared tunnel run advantech-tool
```
> 詳細設定步驟請參考 [Plan/cloudflare_tunnel_setup.md](Plan/cloudflare_tunnel_setup.md)

## 🛠️ 技術棧

- **後端 (Backend)**: Python 3.10+, FastAPI, MongoDB
- **前端 (Frontend)**: Vanilla HTML5, CSS3 (Glassmorphism design), JavaScript (ES6+)
- **資料處理**: Pymongo, Uvicorn, UV Package Manager
- **AI 整合**: RAG 架構 (Phase 1 完成，準備進入 Phase 2 Vector Search)
- **部署**: GitHub Pages + Cloudflare Tunnel

## 📂 專案架構

```text
.
├── app/
│   ├── api/           # API 路由 (selection.py, chat.py, report.py)
│   ├── models/        # Pydantic 資料模型 (selection.py, chat.py)
│   ├── rag/           # RAG 三階段管線 (intent_parser, hard_filter, report_generator)
│   ├── database.py    # MongoDB 連線封裝
│   ├── llm_gateway.py # LLM 統一呼叫層與用量控管
│   └── main.py        # FastAPI 進入點（含前端快取控制）
├── frontend/
│   ├── css/           # 獨立樣式表 (style.css, feature-selector.css, compare.css)
│   ├── js/            # 獨立邏輯腳本 (app.js, scenes.js, feature-selector.js, sfp-selector.js, compare.js)
│   │   └── config.js  # Cloudflare Tunnel URL 設定（部署時填入）
│   ├── index.html     # GitHub Pages 入口（相對路徑版本）
│   └── select_ui_with_options_claude.html  # 後端直接存取版本（絕對路徑）
├── .github/
│   └── workflows/
│       └── deploy-pages.yml  # GitHub Actions 自動部署至 GitHub Pages
├── Plan/
│   └── cloudflare_tunnel_setup.md  # Cloudflare Tunnel 完整設定指南
├── configs/           # 環境變數與金鑰目錄 (.env, credentials.json)
├── logs/              # 系統與開發日誌
├── scripts/           # 資料擷取與同步腳本 (sync_all.py 等)
└── README.md
```

## 🚀 快速啟動

### 1. 環境設定
本專案建議使用 `uv` 進行環境管理：
```bash
# 安裝所需套件
uv sync
```

### 2. 設定金鑰與環境變數 (重要)
由於安全因素，憑證檔案已被 Git 忽略。啟動前請確保 `configs/` 資料夾內包含以下檔案：

#### A. 建立 `configs/.env`
根據專案根目錄的 `.env.example` 建立，填入您的金鑰資訊：

> [!TIP]
> **注意**：`.env` 檔案必須放在 `configs/` 資料夾內（路徑為 `configs/.env`），因為專案腳本與後端程式已固定從該路徑讀取。

```ini
GOOGLE_SHEET_ID="您的_GOOGLE_SHEET_ID"
GOOGLE_CREDENTIALS_PATH="configs/credentials.json"
MONGO_URI="您的_MONGODB_連線字串"
MONGO_DB_NAME="advantech_ind_sw_tool"
```

#### B. 放入 `configs/credentials.json`
- 請從 Google Cloud Console 下載服務帳戶 (Service Account) 的 JSON 金鑰。
- 檔案名稱請命名為 `credentials.json` 並放入 `configs/` 資料夾。
- **注意**：請確保該服務帳戶對於您指定的 Google Sheet 擁有「檢視」權限。

### 3. 啟動後端
若需允許**其他電腦**連線（區域網路），啟動時必須指定 `--host 0.0.0.0`：
```bash
# 啟動 FastAPI (允許外部連線)
uv run uvicorn app.main:app --reload --host 0.0.0.0
```

### 3. 啟動 Cloudflare Tunnel（對外部署時）

```bash
cloudflared tunnel run advantech-tool
```

### 4. 使用前端（三種入口）

#### A. GitHub Pages（推薦對外分享）
```
https://jim6501.github.io/Advantech-AI-Selection-Tool/
```
- 靜態前端，API 會自動打到 `api.namecheapest.cc`（需 Cloudflare Tunnel 運作中）
- 若更換 Tunnel URL，請更新 `frontend/js/config.js` 並 push

#### B. Cloudflare Tunnel URL（完整功能）
```
https://api.namecheapest.cc
```
- 前後端一體，需後端與 Tunnel 同時運作

#### C. 本機直接存取（開發用）
```
http://localhost:8000
```
> [!IMPORTANT]
> 若更換 server 電腦，需將 `~/.cloudflared/` 下的 Tunnel 憑證檔案複製至新電腦，詳見 [Plan/cloudflare_tunnel_setup.md](Plan/cloudflare_tunnel_setup.md)

## 📅 資料維護與同步步驟 (Google Sheets)

當硬體規格、軟體版本或 SFP 模組有更新時，請依以下步驟同步至資料庫：

### 1. 更新 Google Sheets 雲端資料
- **硬體更新**：修改 `Ind. SW` 或 `Train SW` 分頁。
- **軟體更新**：修改各系列對應的分頁（如 `EKI-7700`, `EKI-5500` 等）。
- **SFP 模組更新**：修改 `SFP` 分頁。
- 請確保 **Product PN** 與 **Software Series** 填寫正確，這是合併資料的關鍵。

### 2. 執行一鍵同步 (推薦)
本專案提供一鍵同步腳本，自動完成「Sheets 登入 -> 擷取硬體 -> 擷取軟體 -> 擷取 SFP -> 合併寫入 MongoDB」的 5 階段自動化管線：
```bash
# 執行一鍵同步並生成驗證報告
uv run python scripts/sync_all.py
```

---

### 💡 備用：手動分步同步步驟
若有需要，您也可以分步執行各個擷取與同步腳本：
1. **擷取硬體規格**：`uv run scripts/fetch_hardware_specs.py` -> 存至 `data/hardware_specs_raw.json`
2. **擷取軟體規格**：`uv run scripts/fetch_sw_specs.py` -> 存至 `data/software_specs_raw.json`
3. **擷取 SFP 規格**：`uv run scripts/fetch_sfp_modules.py` -> 存至 `frontend/data/sfp_modules.json`
4. **合併並寫入 MongoDB**：`uv run scripts/sync_specs_to_mongo.py` -> 同步至資料庫並生成 `data/validation_report.json`

> [!NOTE]
> 同步過程會自動根據 Product PN 推導軟體系列，若無法配對，預設會回退至最新版的軟體規格。您可以查看 `data/validation_report.json` 確認哪些型號配對失敗。

## 📈 現階段更新紀錄 (Stage 1)
- [x] 完成 MongoDB 動態特徵掃描邏輯與三態值優化。
- [x] 修正 PoE 與 RJ-45 欄位匹配邏輯（包含 M12 D-code/X-code 支援）。
- [x] 建立自動化特徵對應表，無需手動維護功能清單，並將 Application 動態野放至搜尋選項。
- [x] 前端程式碼模組化重構 (分離 HTML/CSS/JS)，優化 Glassmorphism UI。
- [x] **完成 RAG Chatbot Phase 1 基礎建設**：
  - 實作 3-Stage Pipeline（意圖解析、資料庫篩選、報告生成）。
  - 實作具備 RPM 限流與 Retry 機制的 LLM Gateway。
  - 修正非同步事件迴圈阻塞問題，確保 Chatbot 思考時介面不卡頓。
  - 優化 Chatbot 介面「📄 參考型號」的收納互動與 Chip 視覺。
  - 升級至最新 `google-genai` SDK，配置 `gemini-2.5-flash` 模型。
- [x] **完成進階功能選擇器 (Feature Selector) 建置與分類重構**（2026-05-15 / 2026-06-02）：
  - 設計「Modal 嵌入式」互動模式，使用者無需離開主頁即可瀏覽所有功能分類。
  - 採用混合式架構：10 個大分類卡片（人工維護），子功能清單由 DB 自動同步。
  - 將「應用場景 (Application)」獨立為獨立分類卡片（採用 `◉` 圖示與天藍色設計），與「硬體規格」區隔。
  - 支援大分類卡片展開、前端即時搜尋過濾（零 API 請求）、已選功能 Chip 列。
  - 新增 `FS_HIDDEN_FEATURES` 設定，讓 PM 可一行設定隱藏不常用的子項目。
  - 實作 `fsReset()` 與 `applyFeatureSelector()` 橋接函數，與主頁 Reset All 完整整合。
- [x] **完成 SFP 光纖模組選型面板與一鍵同步管線**（2026-06-02）：
  - 實作前端非同步 SFP 選型面板 ([sfp-selector.js](file:///d:/OneDrive%20-%20advantech/Project/Advantech%20AI%20Selection%20Tool/frontend/js/sfp-selector.js))，依產品光纖/Combo 埠自動推薦 100M/1G/10G 模組，並提供固定接頭之選線建議。
  - 新增 SFP 快捷徽章直接跳轉與場景驗證徽章 (`✓ 場景驗證`)。
  - 整合開發 [sync_all.py](file:///d:/OneDrive%20-%20advantech/Project/Advantech%20AI%20Selection%20Tool/scripts/sync_all.py) 實現一鍵完成 5 階段自動化同步與驗證報告生成。
  - 後端新增 `NoCacheStaticMiddleware` 禁用前端 JS/CSS 瀏覽器快取，避免開發更新延遲。
- [x] **GitHub Pages + Cloudflare Tunnel 部署架構**（2026-06-08）：
  - 前端部署至 GitHub Pages，後端透過 Cloudflare Tunnel 對外暴露。
  - 新增 `frontend/js/config.js` 設定 Tunnel URL，`detectApiBase()` 自動切換本機/外部 API 位址。
  - 建立 GitHub Actions workflow 自動部署 `frontend/` 至 GitHub Pages。
  - 維護兩份 HTML：`index.html`（GitHub Pages 相對路徑版）與 `select_ui_with_options_claude.html`（後端絕對路徑版）。
- [x] **產品規格對比、報表匯出與選型狀態同步**（2026-06-05）：
  - 實作前端產品規格多台對比側拉面板，並自動高亮規格差異。
  - 支援 CSV 表格與 PDF 報表匯出，並放寬限制至單台設備亦可直接下載。
  - 在 `app.js` 的 `removeItem` 函式中新增同步邏輯，當已選條件移除時，自動更新並重繪 Advanced Feature Selector 彈窗 UI。
  - 進階功能篩選器（Advanced Features Filter）的中文標籤與選項全面完成英文標準術語對譯。
- [x] **新增官網產品與 SFP 選型外部連結功能**（2026-06-03）：
  - 於結果頁的產品卡片型號旁、展開卡片底部 CTA、以及 SFP 推薦晶片上，全面新增連往研華官網的外部連結（支援自動 fallback 為官網型號搜尋 URL）。
  - 後端 [ProductItemResponse](file:///d:/OneDrive%20-%20advantech/Project/Advantech%20AI%20Selection%20Tool/app/models/selection.py) 新增 `prod_url` 欄位。
  - 設計精緻 hover 微動畫，滑過外部連結圖示 `↗` 時自動變藍並往右上微幅位移，提升互動感。

---
© 2026 Advantech | AI Selection Tool Project
