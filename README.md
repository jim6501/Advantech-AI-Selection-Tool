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

## 🛠️ 技術棧

- **後端 (Backend)**: Python 3.10+, FastAPI, MongoDB
- **前端 (Frontend)**: Vanilla HTML5, CSS3 (Glassmorphism design), JavaScript (ES6+)
- **資料處理**: Pymongo, Uvicorn, UV Package Manager
- **AI 整合**: RAG 架構 (Phase 1 完成，準備進入 Phase 2 Vector Search)

## 📂 專案架構

```text
.
├── app/
│   ├── api/           # API 路由 (selection.py, chat.py)
│   ├── models/        # Pydantic 資料模型 (selection.py, chat.py)
│   ├── rag/           # RAG 三階段管線 (intent_parser, hard_filter, report_generator)
│   ├── database.py    # MongoDB 連線封裝
│   ├── llm_gateway.py # LLM 統一呼叫層與用量控管
│   └── main.py        # FastAPI 進入點
├── frontend/
│   ├── css/           # 獨立樣式表 (style.css)
│   ├── js/            # 獨立邏輯腳本 (app.js)
│   └── select_ui_with_options_claude.html  # 主選型介面
├── configs/           # 環境變數與金鑰目錄 (.env, credentials.json)
├── logs/              # 系統日誌 (如 llm_usage.log)
├── scripts/           # 資料擷取與同步腳本
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

### 3. 使用前端 (兩路徑)

#### A. 透過後台直接存取 (推薦)
啟動後端後，直接在瀏覽器輸入您的 IP。這會自動處理 API 位址偵測，最適合多人使用：
- **本機使用**：`http://localhost:8000`
- **其他電腦連線**：`http://您的電腦IP:8000` (例如 `http://192.168.1.50:8000`)

#### B. 點擊 HTML 檔案開啟
直接在瀏覽器中開啟 `frontend/select_ui_with_options_claude.html`。
> [!IMPORTANT]
> 此方式下網頁會預設嘗試連線至 `127.0.0.1:8000`。若後台沒開在同一台電腦，搜尋功能將失效。

## 📅 資料維護與同步步驟 (Google Sheets)

當硬體規格或軟體版本有更新時，請依照下列步驟同步至資料庫：

### 1. 更新 Google Sheets 雲端資料
- **硬體更新**：修改 `Ind. SW` 或 `Train SW` 分頁。
- **軟體更新**：修改各系列對應的分頁（如 `EKI-7700`, `EKI-5500` 等）。
- 請確保 **Product PN** 與 **Software Series** 填寫正確，這是合併資料的關鍵。

### 2. 執行資料擷取 (Fetch)
這會將雲端資料轉為本地 JSON 檔案以便處理：
```bash
# 擷取硬體規格
uv run scripts/fetch_hardware_specs.py

# 擷取軟體規格 (包含各系列功能)
uv run scripts/fetch_sw_specs.py
```

### 3. 發送至 MongoDB (Sync)
執行最後的合併與寫入動作：
```bash
# 同步至資料庫並生成驗證報告 (data/validation_report.json)
uv run scripts/sync_specs_to_mongo.py
```

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

---
© 2026 Advantech | AI Selection Tool Project
