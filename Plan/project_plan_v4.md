# 工業交換機規格資料庫與 AI 選型系統 — 完整開發計畫

> **文件版本**：v4.0 — 2026-04-17
> **適用對象**：開發工程師、PM、SW/RD 維護人員

---

## 目錄

1. [系統整體架構與元件總覽](#一系統整體架構與元件總覽)
2. [完整資料流程](#二完整資料流程)
3. [開發流程總覽（含分段驗證）](#三開發流程總覽)
4. [F0｜資料格式確認與前置準備](#f0資料格式確認與前置準備)
5. [F1｜Google Sheet 建置（資料來源層）](#f1google-sheet-建置)
6. [F2｜資料同步腳本（Sheet → MongoDB）](#f2資料同步腳本)
7. [F3｜選型 API（Flask，硬體篩選後端）](#f3選型-api)
8. [F4｜RAG AI 助理（FastAPI + ChromaDB + Gemini）](#f4-rag-ai-助理)
9. [F5｜前端頁面（硬體篩選 + Chatbot）](#f5前端頁面)
10. [F6｜規格比對頁（spec_viewer.html）](#f6規格比對頁)
11. [F7｜向量索引維護（ChromaDB）](#f7向量索引維護)
12. [F8｜驗證、SOP 與維運](#f8驗證sop-與維運)
13. [設計決策紀錄](#設計決策紀錄)
14. [Epic 任務清單](#epic-任務清單)
15. [綜合路線圖](#綜合路線圖)

---

## 一、系統整體架構與元件總覽

### 1.1 系統定位

本系統為 Advantech 工業交換機的**內部選型輔助工具**，主要使用者為業務、PM 及系統整合商。系統由兩個核心功能組成：

- **硬體預篩選工具**：頁面左側，透過條件篩選（管理類型、Port 數、應用場景等）快速縮小型號範圍，並以表格呈現符合條件的型號列表
- **AI 規格查詢 Chatbot**：頁面右下角浮動面板，使用者可針對篩選出來的型號進行自然語言查詢（支援規格比較、應用場景建議、軟體功能確認）

兩個功能**共享同一份 MongoDB 資料**，且 Chatbot 會自動感知篩選工具目前鎖定的型號清單，讓 AI 回答的範圍聚焦。

---

### 1.2 元件清單

```
┌──────────────────────────────────────────────────────────────────────┐
│                          資料維護層                                    │
│                                                                      │
│  Google Sheet（線上共編）                                              │
│  ├── Ind SW Tab        ← PM / RD 硬體組維護（工業型）                  │
│  ├── Train SW Tab      ← PM / RD 硬體組維護（車載型）                  │
│  └── SW Specs Tab      ← SW 軟體組維護（功能規格 / 三態值）            │
└───────────────────┬──────────────────────────────────────────────────┘
                    │ sync_specs_to_mongo.py（定期手動執行）
                    ▼
┌──────────────────────────────────────────────────────────────────────┐
│                          資料庫層（MongoDB）                            │
│                                                                      │
│  hardware_specs    ← 一份文件 = 一台設備（HW 規格）                    │
│  software_specs    ← 一份文件 = 一個系列 × 一個 fw 版本               │
│  product_specs     ← 自動合併，禁止手動編輯（AI 與篩選工具查此層）      │
└──────────┬──────────────────────────────┬────────────────────────────┘
           │                              │
           ▼                              ▼
┌──────────────────┐          ┌────────────────────────────────────────┐
│  選型 API（Flask）│          │  RAG AI 助理（FastAPI）                 │
│  port: 5000      │          │  port: 8000                            │
│  /api/searchProd │          │  /api/chat                             │
│  /api/submitProd │          │  ├── 意圖解析（Gemini）                  │
└────────┬─────────┘          │  ├── Hard Filter（MongoDB）             │
         │                    │  ├── 向量搜尋（ChromaDB）                │
         │                    │  ├── Re-ranking（Gemini）               │
         │                    │  └── 報告生成（Gemini）                  │
         │                    └────────────────────┬───────────────────┘
         │                                         │
         └──────────────┬──────────────────────────┘
                        ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    前端（select_ui_with_options.html）                  │
│                                                                      │
│  ┌─────────────────────────────────┐  ┌───────────────────────────┐  │
│  │  硬體預篩選區（左側主頁面）       │  │  AI Chatbot（右下浮動面板） │  │
│  │  - 管理類型下拉選單              │  │  - 自動感知已篩選型號       │  │
│  │  - Port 數量選單                │  │  - 自然語言查詢             │  │
│  │  - 型號搜尋（即時 API）          │  │  - Quick Prompt 按鈕       │  │
│  │  - 選型結果表格                 │  │  - 對話歷史（前端維護）      │  │
│  └─────────────────────────────────┘  └───────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    向量資料庫（ChromaDB）                               │
│  Datasheet MD 文件 → embed_chunks.py → 向量索引                       │
│  供 RAG 語意搜尋使用                                                   │
└──────────────────────────────────────────────────────────────────────┘
```

### 1.3 技術堆疊

| 層次 | 技術 | 說明 |
|---|---|---|
| 資料維護 | Google Sheets + gspread | 線上共編，非工程師也能操作 |
| 資料庫 | MongoDB Atlas | 三層 Collection，product_specs 為查詢主層 |
| 選型後端 | Flask（port 5000） | 硬體條件篩選 API，對接前端主頁面 |
| AI 後端 | FastAPI（port 8000） | RAG 查詢 API，對接 Chatbot 面板 |
| LLM | Google Gemini | 意圖解析、Re-ranking、報告生成 |
| 向量資料庫 | ChromaDB | Datasheet 向量索引，供語意搜尋 |
| 前端 | 純 HTML + JS | 現有 `select_ui_with_options.html`，含篩選 + Chatbot |
| 資料同步 | Python 腳本 | `sync_specs_to_mongo.py`，定期手動執行 |

---

## 二、完整資料流程

### 2.1 資料寫入流程（維護端）

```
Google Sheet 更新
       ↓
工程師執行 sync_specs_to_mongo.py
       ↓
① 讀取 Ind SW + Train SW → 正規化 → upsert hardware_specs
② 讀取 SW Specs → 展開複合系列名 → 標記 is_latest → upsert software_specs
③ 驗證（ERROR/WARN）→ 輸出 validation_report.json
④ 非 BLOCKED 型號：merge HW + SW → upsert product_specs
⑤ 建立 / 確認 MongoDB Index
       ↓
工程師確認 validation_report.json 無 ERROR
       ↓
資料就緒，選型工具與 AI 即時感知新資料
```

### 2.2 使用者查詢流程（前端 → 硬體篩選）

```
使用者在頁面設定條件（管理類型 / Port 數 / Application）
       ↓
① 即時搜尋：searchInput → GET /api/searchProdType?q=xxx → 顯示下拉候選
② 送出篩選：SEND TO BACKEND → POST /api/submitProdType
              { items, type, portnum }
       ↓
Flask API 查詢 MongoDB product_specs（Hard Filter）
       ↓
回傳型號清單 → 前端渲染表格 + 更新 acquiredModels
       ↓
Chatbot 的 contextBar 自動更新「AI 已鎖定分析：EKI-7720G...」
```

### 2.3 使用者查詢流程（前端 → Chatbot）

```
使用者輸入自然語言問題
       ↓
前端打包 payload：
  { message, context: { selected_models, filters }, history[-12] }
       ↓
POST /api/chat → FastAPI RAG 流程：
  ① 意圖解析（Gemini）→ 抽出結構化條件 JSON
  ② Hard Filter（MongoDB）→ 候選型號子集
  ③ 向量搜尋（ChromaDB）→ 在子集內語意搜尋 top-10
  ④ Re-ranking（Gemini）→ top-10 → top-3
  ⑤ 報告生成（Gemini）→ 依 top-3 規格生成回答
       ↓
回傳 { answer, referenced_models, sources }
       ↓
前端 appendMessage：渲染 Markdown + 顯示參考型號 + 可展開原廠規格片段
```

---

## 三、開發流程總覽

開發順序遵循「資料先行、後端次之、前端整合、端對端驗證」的原則。

```
F0  資料格式確認與前置準備        ← 所有後續工作的基礎，必須先完成
 ↓
F1  Google Sheet 建置             ← 資料唯一來源，欄位鎖定後才能開發 F2
 ↓
F2  Sync 腳本（Sheet → MongoDB）  ← 資料就緒，F3/F4 才有資料可查
 ↓
F3  選型 API（Flask）  ──┐
F4  RAG AI 助理（FastAPI）├── 可平行開發，共用同一份 product_specs
F7  ChromaDB 向量索引  ──┘
 ↓
F5  前端整合（篩選 + Chatbot）    ← 等 F3 / F4 API 就緒再對接
 ↓
F6  規格比對頁（spec_viewer）     ← 獨立功能，可最後開發
 ↓
F8  驗證、SOP、維運文件           ← 貫穿全程，每個 Epic 結束都要更新
```

### 分段驗證原則

每個 Epic 完成後都要通過**驗收閘門（Gate）**，才能進入下一個 Epic：

| Gate | 時機 | 驗收標準 |
|---|---|---|
| G0 | F0 完成後 | Application 標準值清單鎖定、欄位規格書確認 |
| G1 | F1 完成後 | Google Sheet 三個 Tab 公式與格式正確，可手動填入資料 |
| G2 | F2 完成後 | `validation_report.json` 無 ERROR，三層 Collection 資料正確 |
| G3 | F3 完成後 | API 回傳正確型號清單，篩選條件覆蓋全部欄位 |
| G4 | F4 完成後 | Chatbot 回答正確反映 MongoDB 資料，Re-ranking 有效縮小範圍 |
| G5 | F5 完成後 | 端對端使用者流程通過，篩選結果正確傳入 Chatbot context |

---

## F0：資料格式確認與前置準備

> **這是整個專案最重要的起始點。** 任何欄位規格的模糊都會在後續每個 Epic 造成返工。

### 開發目標

在動任何程式碼之前，先把所有「資料長什麼樣子」的問題都釐清並文件化。

### 需要確認的項目

#### F0-1：Application 標準值清單（最優先，所有 Epic 的前置依賴）

與 PM 確認以下標準值，確認後**不得任意新增**（新增需走正式變更流程）：

| 值 | 適用場景 |
|---|---|
| `Industrial` | 一般工廠、製造業 |
| `Smart Factory` | 智慧工廠 / OT 網路 |
| `Substation` | 電力變電站 |
| `Rolling Stock` | 鐵路車廂 |
| `Trackside` | 鐵路軌旁設備 |
| `General Purpose` | 通用型，無特定應用場景 |

> ⚠️ 此清單一旦鎖定，就要同步更新到：Google Sheet 下拉選單、MongoDB index、前端篩選選單、RAG Query Expansion 關鍵字對應表。

#### F0-2：欄位規格書

確認以下欄位在三個工作表中的名稱、類型、必填性：

**Ind SW / Train SW Tab 必填欄位：**

| 欄位名稱 | 類型 | 必填 | 說明 |
|---|---|---|---|
| `product_pn` | 文字 | ✅ | 完整料號，唯一鍵，如 `EKI-7720G-4F1-AE` |
| `model_name` | 文字 | ✅ | 如 `EKI-7720G` |
| `application` | 下拉 | ✅ | 從 F0-1 標準值清單選擇 |
| `software_series` | 文字 | ✅ | 如 `EKI-7700`，對應 SW Specs Tab |
| `firmware_ver` | 下拉 | ✅ | 如 `1.03.XX`，從 SW Specs Tab 動態產生選項 |
| `lifecycle` | 下拉 | ✅ | `Active` / `EOL` |
| `rj45_100m` | 數字 | ✅ | RJ-45 10/100M Port 數量 |
| `rj45_gige` | 數字 | ✅ | RJ-45 GigE Port 數量 |
| ... | ... | ... | 其他 Port / PoE 欄位 |

**SW Specs Tab 必填欄位：**

| 欄位名稱 | 類型 | 說明 |
|---|---|---|
| `software_series` | 文字 | 可複合命名，如 `EKI-5700/7400/7700` |
| `firmware_ver` | 文字 | 如 `1.03.XX` |
| 各功能欄位 | 下拉 `●/○/-` | 三態值，見 F0-3 |

#### F0-3：三態值規範鎖定

| Excel 符號 | 語意 | MongoDB 存入值 | 查詢含義 |
|---|---|---|---|
| `●` | 完整內建支援 | `"full"` | 一定有 |
| `○` | 選配（需授權/條件） | `"optional"` | 可能有，需確認 |
| `-` | 不支援 | `"no"` | 沒有 |
| 空白 | 尚未填寫 | `""` | 視同 WARN |

#### F0-4：SW Series 展開規則確認

確認複合系列名的展開規則，並確認所有已知複合命名格式：

```
EKI-5700/7400/7700     → EKI-5700, EKI-7400, EKI-7700
EKI-9200/9500          → EKI-9200, EKI-9500
```

> 確認是否有格式例外（如含字母 `EKI-5700A/5700B`），若有則需在腳本額外處理。

#### F0-5：現有 Flask API 資料格式確認

檢視現有 `app_slct 1.py`，確認以下欄位名稱（對應前端 HTML 已固定使用的欄位）：

```javascript
// 前端 select_ui_with_options.html 中已固定的欄位名稱
item.prod_model
item.prod_type
item.prod_portnum
item.prod_rj_100
item.prod_rj_giga
item.prod_rj_100_combo
item.prod_fiber_100
item.prod_fiber_giga
item.prod_fiber_ge_combo
item.prod_w_n
item.prod_name   // 用於 acquiredModels，傳入 Chatbot context
```

> 這些欄位名稱已硬寫在前端，後端 API 回傳格式**必須對齊**，否則表格會空白。

### 分段驗證（G0 Gate）

- [ ] Application 標準值清單已與 PM 確認並書面記錄
- [ ] 欄位規格書已輸出為文件，RD / SW / PM 各角色都確認
- [ ] 三態值規範已確認，SW 組了解填寫規則
- [ ] 現有 Flask API 的回傳欄位格式已記錄，與前端對齊確認

### 注意事項

- **Application 標準值必須在 F1 開始前確認**，否則 Google Sheet 的下拉選單無法設定
- **firmware_ver 欄位是 v4.0 新增**，需確認 RD 了解此欄位的填寫規則
- 若 SW Specs Tab 有現有資料，需先確認複合系列名的所有格式，再撰寫展開邏輯

---

## F1：Google Sheet 建置

### 開發目標

建立三個工作表作為資料唯一來源，設定公式、下拉選單、條件格式，讓非工程師可以安全地維護資料。

### 初步規劃

#### F1-1：建立工作表結構

```
Google Sheet
├── Ind SW（工業型硬體規格）
├── Train SW（車載型硬體規格）
└── SW Specs（軟體功能規格）
```

每個 Tab 的第一行為欄位標題，第二行起為資料。**標題行鎖定不可修改**（保護範圍設定）。

#### F1-2：Ind SW / Train SW Tab 公式欄

```
Port 計算公式（total_port_count 欄）：
=J2+K2+L2+M2+O2+P2+Q2   ← 各 Port 欄位加總

PoE 驗證公式（PoE 驗證欄）：
=IF((R2+S2)>(J2+K2+L2), "⚠️ PoE 超限", "OK")
```

#### F1-3：firmware_ver 下拉選單（v4.0 新增）

`firmware_ver` 欄位的下拉選項需從 SW Specs Tab 動態抓取，建議使用 Named Range：

```
在 SW Specs Tab：定義 Named Range "fw_ver_list" → 指向 firmware_ver 欄的唯一值
在 Ind SW Tab：=INDIRECT("fw_ver_list") 做為資料驗證來源
```

> 每次 SW Specs Tab 新增 fw 版本後，Ind SW Tab 的下拉選單會自動更新。

#### F1-4：三態值下拉選單（SW Specs Tab）

所有功能欄位設定資料驗證：允許清單 `●,○,-`（不含空白，空白代表尚未填寫，視為 WARN）。

#### F1-5：條件格式設定

| 條件 | 套用範圍 | 格式 |
|---|---|---|
| PoE 驗證欄 = "⚠️ PoE 超限" | PoE 相關欄 | 紅色背景 |
| `software_series` 空白 | 整列 | 橘色背景 |
| `application` 空白 | 整列 | 黃色背景 |
| `firmware_ver` 空白 | 整列 | 黃色背景 |
| `lifecycle = EOL` | 整列 | 灰色字體 |

#### F1-6：Google Cloud Service Account

```bash
# 步驟
1. 前往 Google Cloud Console → 建立 Service Account
2. 下載 credentials.json → 加入 .gitignore，不可 commit
3. 將 Service Account email 加入 Google Sheet 共用（檢視者權限即可）
4. 更新 .env：
   GOOGLE_SHEET_ID=your_sheet_id
   GOOGLE_CREDENTIALS_PATH=./credentials.json
```

### 分段驗證（G1 Gate）

- [ ] 三個 Tab 的欄位標題與 F0 欄位規格書完全一致
- [ ] Port 計算公式在所有資料列正確運作
- [ ] PoE 驗證公式可正確標示超限
- [ ] firmware_ver 下拉選單與 SW Specs Tab 的 fw 版本同步
- [ ] 三態值下拉選單只允許 `●/○/-`
- [ ] 條件格式在 5 筆測試資料上正確顯示
- [ ] Service Account 可成功讀取 Google Sheet 資料（以 gspread 測試）

### 注意事項

- Google Sheet 的 Named Range 跨 Tab 參照在某些版本行為不同，需實際測試
- `credentials.json` 絕對不能 commit，建議用 CI/CD 環境變數或 Secret Manager
- 建議對標題行設定「保護範圍」，只有工程師才能修改欄位名稱

---

## F2：資料同步腳本

### 開發目標

`scripts/sync_specs_to_mongo.py`：從 Google Sheet 讀取最新資料，執行驗證，寫入 MongoDB 三層 Collection，輸出 validation_report.json。

### MongoDB Schema（三層設計）

**Collection 1：`hardware_specs`**（一份文件 = 一台設備）

```json
{
  "product_pn":      "EKI-7720G-4F1-AE",
  "model_name":      "EKI-7720G",
  "software_series": "EKI-7700",
  "firmware_ver":    "1.03.XX",
  "application":     "Industrial",
  "lifecycle":       "Active",
  "filter": {
    "application": "Industrial",
    "function":    "Managed",
    "port_count":  8,
    "has_poe":     false,
    "has_fiber":   true,
    "temp_grade":  "Wide"
  },
  "hardware": {
    "ports": { "rj45_100m": 0, "rj45_gige": 4, ... },
    "poe":   { "poe_100m": 0, "poe_gige": 4, "power_budget_w": 240 },
    "power": { "input_voltage": "12~48 VDC" },
    "environment": { "op_temp": "-40~75°C", "temp_grade": "Wide" }
  }
}
```

**Collection 2：`software_specs`**（一份文件 = 一系列 × 一 fw 版本）

```json
{
  "_id":             "EKI-7700::1.03.XX",
  "software_series": "EKI-7700",
  "firmware_ver":    "1.03.XX",
  "is_latest":       true,
  "software": {
    "l2_switching":   { "vlan_802_1q": "full", "rstp_802_1w": "full", ... },
    "redundancy":     { "xring_pro": "full", "erps_g8032": "full", ... },
    "security":       { "ieee_802_1x": "full", "iec_62443_4_2": "optional" },
    "management":     { "snmp_v1v2c_v3": "full", "profinet": "optional" },
    "vertical_market":{ "ieee_1588v2_ptp": "full", "iec_61850": "no" }
  }
}
```

**Collection 3：`product_specs`**（自動產生，禁止手動編輯）

```json
{
  "product_pn":      "EKI-7720G-4F1-AE",
  "software_series": "EKI-7700",
  "firmware_ver":    "1.03.XX",
  "is_latest":       true,
  "lifecycle":       "Active",
  "filter":   { /* 完整複製自 hardware_specs.filter */ },
  "hardware": { /* 完整複製自 hardware_specs.hardware */ },
  "software": { /* 完整複製自 software_specs.software */ },
  "_synced_at": "2026-04-17T10:30:00Z"
}
```

### 關鍵邏輯：SW Series 展開與 firmware 版本 Mapping

```python
def expand_series(row: dict) -> list[dict]:
    """
    "EKI-5700/7400/7700" + fw "1.03.XX"
    → 三份文件：EKI-5700::1.03.XX / EKI-7400::1.03.XX / EKI-7700::1.03.XX
    """
    raw    = row["software_series"]        # "EKI-5700/7400/7700"
    prefix = raw.split("-")[0] + "-"       # "EKI-"
    parts  = raw.split("-")[1].split("/")  # ["5700", "7400", "7700"]
    series_list = [prefix + p for p in parts]

    return [
        {**row, "software_series": s, "_id": f"{s}::{row['firmware_ver']}"}
        for s in series_list
    ]

def mark_latest(docs: list[dict]) -> list[dict]:
    """同系列中版本最新者標記 is_latest=True，其餘為 False"""
    from packaging.version import Version
    grouped = {}
    for d in docs:
        grouped.setdefault(d["software_series"], []).append(d)
    result = []
    for series, items in grouped.items():
        items.sort(key=lambda x: Version(x["firmware_ver"].replace("XX","0")), reverse=True)
        for i, item in enumerate(items):
            item["is_latest"] = (i == 0)
            result.append(item)
    return result
```

### 驗證規則

```python
# ERROR 級（這些記錄會被 BLOCKED，不寫入 product_specs）
def validate(record, known_sw_keys):
    errors = []

    if not record.get("product_pn"):
        errors.append(("ERROR", "product_pn 為空"))

    key = f"{record.get('software_series')}::{record.get('firmware_ver')}"
    if key not in known_sw_keys:
        errors.append(("ERROR", f"找不到 SW 文件 {key}（FK 斷鍊）"))

    max_poe = record["rj45_100m"] + record["rj45_gige"] + record["combo_count"]
    if (record["poe_100m"] + record["poe_gige"]) > max_poe:
        errors.append(("ERROR", "PoE 口數超過 RJ-45 可用口數"))

    # WARN 級（記錄 warning，但仍寫入）
    calculated = sum([record[f] for f in PORT_FIELDS])
    if calculated != record["excel_port_numbers"]:
        errors.append(("WARN", f"Port 總數不符（Excel={record['excel_port_numbers']}, 計算={calculated}）"))

    for k in record:
        if k not in KNOWN_FIELDS:
            errors.append(("WARN", f"未知欄位 '{k}'"))

    return errors
```

### MongoDB Index

```python
# Compound Index：選型工具主要篩選欄位
db.product_specs.create_index([
    ("filter.application", 1),
    ("filter.function",    1),
    ("filter.port_count",  1),
    ("filter.has_poe",     1),
    ("filter.temp_grade",  1),
], name="idx_filter_compound")

db.product_specs.create_index("lifecycle",       name="idx_lifecycle")
db.product_specs.create_index("software_series", name="idx_sw_series")
db.product_specs.create_index("firmware_ver",    name="idx_fw_ver")
db.product_specs.create_index("is_latest",       name="idx_is_latest")
```

### 分段驗證（G2 Gate）

- [ ] `expand_series()` 在所有已知複合格式上輸出正確
- [ ] `mark_latest()` 在多 fw 版本場景下標記正確
- [ ] 所有驗證規則（ERROR/WARN）觸發條件正確
- [ ] `validation_report.json` 格式正確，包含 summary / blocked / warnings
- [ ] 首次全量同步：`total = success + warn + blocked`（無遺漏）
- [ ] MongoDB 三層 Collection 資料正確（以 mongo-express 查詢確認）
- [ ] Index 建立成功，`explain()` 確認查詢命中 idx_filter_compound

### 注意事項

- **先驗後寫**：驗證階段有 ERROR 時，整批次不寫入，還是只跳過 BLOCKED？建議跳過 BLOCKED，讓其他正常資料可以繼續 sync
- `credentials.json` 路徑從 `.env` 讀取，不要 hardcode
- `product_specs` 在每次 sync 時應以 upsert 更新（不是 delete + insert），避免 downtime
- 同步腳本執行時間若超過 30 秒，考慮加進度顯示（tqdm）

---

## F3：選型 API

### 開發目標

Flask 後端（port 5000），提供兩個 API 端點，對接前端的硬體預篩選功能：
- `GET /api/searchProdType?q=xxx`：即時型號搜尋
- `POST /api/submitProdType`：依條件篩選，回傳完整型號列表

### 初步規劃

#### 端點 1：搜尋型號（即時搜尋）

```python
@app.route("/api/searchProdType")
def search_prod_type():
    q = request.args.get("q", "")
    results = db.product_specs.find(
        {"product_pn": {"$regex": q, "$options": "i"},
         "lifecycle": {"$ne": "EOL"},
         "is_latest": True},
        {"product_pn": 1}
    ).limit(10)
    return jsonify([r["product_pn"] for r in results])
```

#### 端點 2：條件篩選（主要選型）

```python
@app.route("/api/submitProdType", methods=["POST"])
def submit_prod_type():
    data = request.json
    items    = data.get("items", [])     # 手動選擇的型號（前端已選）
    mgmt     = data.get("type", "")      # "managed" / "unmanaged"
    portnum  = data.get("portnum", "")   # "8" / "16" / ...

    mongo_filter = {"lifecycle": {"$ne": "EOL"}, "is_latest": True}

    if mgmt:
        mongo_filter["filter.function"] = mgmt.capitalize()
    if portnum:
        mongo_filter["filter.port_count"] = int(portnum)
    if items:
        mongo_filter["product_pn"] = {"$in": items}

    products = list(db.product_specs.find(mongo_filter))
    return jsonify({
        "status": "success",
        "products": [format_product(p) for p in products]
    })

def format_product(p: dict) -> dict:
    """將 MongoDB 文件轉為前端期望的欄位格式"""
    return {
        "prod_name":         p["product_pn"],
        "prod_model":        p["model_name"],
        "prod_type":         p["filter"]["function"],
        "prod_portnum":      p["hardware"]["ports"]["total_port_count"],
        "prod_rj_100":       p["hardware"]["ports"]["rj45_100m"],
        "prod_rj_giga":      p["hardware"]["ports"]["rj45_gige"],
        "prod_rj_100_combo": p["hardware"]["ports"]["combo_count"],
        "prod_fiber_100":    p["hardware"]["ports"]["fiber_100m"],
        "prod_fiber_giga":   p["hardware"]["ports"]["fiber_gige"],
        "prod_fiber_ge_combo": p["hardware"]["ports"].get("fiber_10g", 0),
        "prod_w_n":          p["hardware"]["environment"]["temp_grade"],
    }
```

> **重要**：`format_product()` 的欄位名稱必須與前端 HTML 中的 `item.prod_*` 完全一致，否則表格不顯示。

#### 未來可擴充的篩選條件

以下欄位目前前端尚未有 UI，但後端可預先支援：

| 篩選欄位 | MongoDB 路徑 | 說明 |
|---|---|---|
| Application | `filter.application` | 工業 / 車載 / 電力 |
| PoE | `filter.has_poe` | true / false |
| 溫度等級 | `filter.temp_grade` | Wide / Normal |
| 光纖 | `filter.has_fiber` | true / false |
| 軟體功能 | `software.*.*` | 三態值查詢 |

### 分段驗證（G3 Gate）

- [ ] `GET /api/searchProdType?q=EKI-77` 回傳正確的型號清單
- [ ] `POST /api/submitProdType` 帶 `type=managed, portnum=8` 回傳正確結果
- [ ] `prod_name` 欄位存在且為完整料號（供 Chatbot context 使用）
- [ ] EOL 型號不出現在結果中
- [ ] 前端表格所有欄位正確渲染（非 undefined）
- [ ] `contextBar` 正確更新「AI 已鎖定分析：…」

### 注意事項

- 前端 `MAIN_API` 指向 `http://{hostname}:5000`，若 Flask 跑在不同 host 要設 CORS
- `prod_name` 欄位關係到 Chatbot 能否正確拿到型號 context，一定不能漏

---

## F4：RAG AI 助理

### 開發目標

FastAPI 後端（port 8000），提供 `/api/chat` 端點，實作 Hybrid Retrieval 架構，讓 AI 回答精準且有規格依據。

### 架構設計（Hybrid Retrieval）

```
使用者問題
     ↓
[Layer 1] 意圖解析（Gemini）
  → 抽出結構化篩選條件 JSON
  → 分離自然語言語意部分
     ↓
[Layer 2] Hard Filter（MongoDB product_specs）
  → 精確條件過濾（application / has_poe / temp_grade / software.*.feature）
  → 結合前端傳入的 selected_models（優先範圍）
  → 排除 lifecycle=EOL、is_latest=True
  → 輸出候選型號子集（通常 5~30 筆）
     ↓
[Layer 3] 向量語意搜尋（ChromaDB）
  → 只在候選子集內執行（where: product_pn in candidates）
  → 搜尋 top-10 相關 Datasheet 片段
     ↓
[Layer 4] Re-ranking（Gemini）
  → top-10 → top-3（附相關性評分與理由）
     ↓
[Layer 5] 報告生成（Gemini）
  → 只傳入 top-3 的完整規格（避免 context 過長）
  → 生成結構化回答（Markdown 格式）
     ↓
回傳 { answer, referenced_models, sources }
```

### 各層實作

#### Layer 1：意圖解析

```python
INTENT_PROMPT = """
你是工業交換機選型助理。從使用者問題抽取結構化條件，回傳 JSON（不加 Markdown 包裹）：
{
  "filter": {
    "application": null,        // "Industrial"/"Rolling Stock"/"Substation"/null
    "function": null,           // "Managed"/"Unmanaged"/null
    "has_poe": null,            // true/false/null
    "temp_grade": null,         // "Wide"/"Normal"/null
    "port_count_min": null      // 整數/null
  },
  "software_requirements": [],  // e.g. ["iec_61850", "profinet", "mrp_iec62439_2"]
  "semantic_query": ""          // 剩餘無法結構化的自然語言
}
問題：{user_query}
"""
```

#### Layer 2：Hard Filter

```python
def build_mongo_filter(intent: dict, selected_models: list[str]) -> dict:
    f = {"lifecycle": {"$ne": "EOL"}, "is_latest": True}

    if selected_models:
        f["product_pn"] = {"$in": selected_models}  # 優先鎖定前端已篩選的型號

    cf = intent.get("filter", {})
    if cf.get("application"):
        f["filter.application"] = cf["application"]
    if cf.get("function"):
        f["filter.function"] = cf["function"]
    if cf.get("has_poe") is not None:
        f["filter.has_poe"] = cf["has_poe"]
    if cf.get("temp_grade"):
        f["filter.temp_grade"] = cf["temp_grade"]
    if cf.get("port_count_min"):
        f["filter.port_count"] = {"$gte": cf["port_count_min"]}

    for sw_feat in intent.get("software_requirements", []):
        # 在 software 子文件中找對應功能
        f[f"software.*.{sw_feat}"] = {"$in": ["full", "optional"]}

    return f
```

#### Layer 3：向量搜尋（只在候選子集內）

```python
def vector_search_in_subset(semantic_query: str, candidate_pns: list[str], top_k: int = 10):
    results = chroma_collection.query(
        query_texts=[semantic_query],
        n_results=top_k,
        where={"product_pn": {"$in": candidate_pns}}  # 關鍵：限制搜尋範圍
    )
    return results
```

> **設計重點**：`where` 條件把向量搜尋的範圍限制在 Hard Filter 的候選子集內，大幅減少語意漂移。

#### Layer 4：Re-ranking

```python
RERANK_PROMPT = """
以下是候選型號的規格摘要。請根據使用者問題評分（0~10），
回傳 JSON（不加 Markdown 包裹）：
[{"product_pn": "...", "score": 8, "reason": "符合 Wide Temp 且支援 IEC 61850"}]

使用者問題：{user_query}
候選型號：{candidates_json}
"""
```

#### Layer 5：報告生成

```python
REPORT_PROMPT = """
你是 Advantech 工業交換機選型 AI 助手。
請根據以下型號的規格資料，回答使用者的問題。
回答使用繁體中文，格式使用 Markdown，需包含型號推薦理由。

使用者問題：{user_query}
對話歷史：{history}
型號規格（只有最相關的 top-3）：
{top3_specs_json}
"""
```

### API 端點設計

```python
@app.post("/api/chat")
async def chat(payload: ChatRequest):
    # payload 格式（對應前端傳來的 payload）：
    # {
    #   message: str,
    #   context: { selected_models: list[str], filters: dict },
    #   history: list[{ role, content }]
    # }

    intent = parse_intent(payload.message)
    mongo_filter = build_mongo_filter(intent, payload.context.selected_models)
    candidates = list(db.product_specs.find(mongo_filter, {"product_pn": 1}))
    candidate_pns = [c["product_pn"] for c in candidates]

    if not candidate_pns:
        return {"answer": "依照您的條件找不到符合的型號，請嘗試放寬篩選條件。",
                "referenced_models": [], "sources": []}

    vector_results = vector_search_in_subset(intent["semantic_query"], candidate_pns)
    reranked = rerank(payload.message, vector_results, candidate_pns)
    top3_pns = [r["product_pn"] for r in reranked[:3]]

    top3_specs = list(db.product_specs.find({"product_pn": {"$in": top3_pns}}))
    answer = generate_report(payload.message, payload.history, top3_specs)

    return {
        "answer": answer,
        "referenced_models": top3_pns,
        "sources": vector_results["documents"][0][:3]  # 前端 details 展開用
    }
```

### 分段驗證（G4 Gate）

- [ ] 意圖解析在 10 個測試問題上正確抽出結構化條件
- [ ] Hard Filter 在 selected_models 有值時正確限縮範圍
- [ ] 向量搜尋的 `where` 條件有效（搜尋結果只來自候選子集）
- [ ] Re-ranking 正確從 10 個候選中選出 3 個最相關
- [ ] `referenced_models` 正確回傳，前端 `msg-refs` 正確顯示
- [ ] `sources` 正確回傳，前端 `details` 展開正確顯示規格片段
- [ ] 對話歷史（history）正確帶入，AI 能理解上下文

### 注意事項

- **意圖解析的 JSON 解析**：Gemini 有時會在 JSON 外加 Markdown 包裹（```json ... ```），需要 strip 後再 parse
- **候選子集為空的處理**：Hard Filter 無結果時，不要讓向量搜尋全庫搜尋，而是直接回傳「找不到」
- **history 長度控制**：前端已限制 slice(-12)，後端應再做一次長度確認，防止 token 超限
- **軟體功能路徑問題**：`software.*.feature` 的萬用字元查詢在 MongoDB 不直接支援，需要展開成多個 `$or` 條件

```python
# 軟體功能查詢的正確寫法
sw_conditions = []
for feat in intent["software_requirements"]:
    for category in ["l2_switching", "redundancy", "security", "management", "vertical_market"]:
        sw_conditions.append({f"software.{category}.{feat}": {"$in": ["full", "optional"]}})

if sw_conditions:
    f["$or"] = sw_conditions
```

---

## F5：前端頁面

### 現有架構說明

`select_ui_with_options.html` 已實作以下功能：

| 功能 | 實作狀態 | 說明 |
|---|---|---|
| 管理類型下拉 | ✅ 已完成 | Managed / Unmanaged |
| Port 數量下拉 | ✅ 已完成 | 固定選項 5/6/8/.../28 |
| 型號搜尋（即時） | ✅ 已完成 | 呼叫 `/api/searchProdType` |
| 選型結果表格 | ✅ 已完成 | 渲染 `prod_*` 欄位 |
| Chatbot 浮動面板 | ✅ 已完成 | 右下角 FAB，滑入側邊欄 |
| Chatbot context 同步 | ✅ 已完成 | `updateContextBar()` + `acquiredModels` |
| 對話歷史維護 | ✅ 已完成 | `chatHistory[]` 前端維護，帶入 history[-12] |
| Quick Prompt 按鈕 | ✅ 已完成 | 五個預設問題 |

### 待新增功能

#### F5-1：Application 篩選下拉（新增）

```html
<div class="section">
    <label>Application</label>
    <select id="applicationFilter">
        <option value="">All Applications</option>
        <option value="Industrial">Industrial</option>
        <option value="Smart Factory">Smart Factory</option>
        <option value="Substation">Substation</option>
        <option value="Rolling Stock">Rolling Stock</option>
        <option value="Trackside">Trackside</option>
        <option value="General Purpose">General Purpose</option>
    </select>
</div>
```

並在 `submitItems()` 中加入此欄位：

```javascript
body: JSON.stringify({
    items:       selectedItems,
    type:        document.getElementById('mgmtType').value,
    portnum:     numInput.value,
    application: document.getElementById('applicationFilter').value  // 新增
})
```

#### F5-2：確認前端篩選條件與後端 API 欄位對應

| 前端控制項 | JS 變數 | POST body 欄位 | Flask 接收 | MongoDB 路徑 |
|---|---|---|---|---|
| Management Type | `mgmtType.value` | `type` | `data["type"]` | `filter.function` |
| Port Number | `numInput.value` | `portnum` | `data["portnum"]` | `filter.port_count` |
| Application（新增） | `applicationFilter.value` | `application` | `data["application"]` | `filter.application` |
| Search Inventory | `selectedItems[]` | `items` | `data["items"]` | `product_pn.$in` |

#### F5-3：selected_models 傳入 Chatbot 的正確性確認

現有程式碼：

```javascript
// 手動選擇的型號（selected Items）+ 後端篩選出來的型號（acquiredModels）取聯集
const combinedModels = Array.from(new Set([...selectedItems, ...acquiredModels]));
```

確認 `acquiredModels` 從後端回傳的 `prod_name` 欄位正確填入（F3 已確認此欄位存在）。

### 分段驗證（G5 Gate）

- [ ] Application 下拉新增後，篩選結果正確過濾（選 Rolling Stock 只顯示車載型）
- [ ] 硬體篩選結果更新後，Chatbot contextBar 正確顯示已鎖定型號
- [ ] Chatbot 在 `selected_models` 有值時，回答只提到這些型號的規格
- [ ] RESET ALL 後，`acquiredModels` 清空，contextBar 恢復「尚未鎖定任何型號」
- [ ] 端對端流程：篩選 → 表格 → 開 Chatbot → 提問 → 正確回答 → 顯示參考型號

### 注意事項

- `MAIN_API`（port 5000）和 `RAG_API`（port 8000）是兩個不同服務，CORS 需各自設定
- `prod_name` vs `prod_model` 容易混淆：`prod_name` 是完整料號（`EKI-7720G-4F1-AE`），`prod_model` 是型號名（`EKI-7720G`），傳入 Chatbot 的應該是 `prod_name`

---

## F6：規格比對頁

### 開發目標

獨立頁面 `spec_viewer.html`，供業務 / PM 比較多個型號的完整規格，並可匯出 Excel。

### 功能規格

```
[型號搜尋] [+ 加入比對]    比對中：EKI-7720G ✖  EKI-7710E ✖    [清除全部]

篩選：[Managed ▼] [PoE ▼] [Wide Temp ▼] [Application ▼]

╔══════════════════╦══════════════════╦══════════════════╗
║ 規格項目         ║ EKI-7720G-4F1-AE ║ EKI-7710E-2HI-AE ║
╠══════════════════╬══════════════════╬══════════════════╣
║ 管理類型         ║ Managed          ║ Managed          ║
║ Port 數量        ║ 8                ║ 10               ║
║ PoE 支援         ║ 🟢 有 (240W)     ║ ⚫ 無             ║
║ 工作溫度         ║ -40~75°C         ║ -10~60°C         ║
╠══════════════════╬══════════════════╬══════════════════╣
║ X-Ring Pro       ║ 🟢 完整支援      ║ 🟢 完整支援      ║
║ IEC 61850        ║ ⚫ 不支援        ║ 🟠 選配支援      ║
║ PROFINET         ║ 🟠 選配支援      ║ ⚫ 不支援        ║
╚══════════════════╩══════════════════╩══════════════════╝

[匯出 Excel]
```

### 初步規劃

- 型號搜尋同 F3 的 `/api/searchProdType`，最多選 5 個型號
- 規格資料呼叫新端點 `GET /api/productSpec?pn=EKI-7720G-4F1-AE` 回傳完整 product_specs
- 三態值 Badge：`full` → 🟢，`optional` → 🟠，`no` → ⚫
- Excel 匯出使用 SheetJS（前端直接處理，不需後端）

---

## F7：向量索引維護

### 開發目標

維護 ChromaDB 向量索引的健康，確保新型號 Datasheet 能及時加入索引。

### Datasheet 處理流程

```
PDF Datasheet
     ↓
PDF → Markdown 轉換（pdfplumber / pypdf2）
     ↓
清洗：去除頁首/頁尾、表格轉文字、移除雜訊
     ↓
切 chunk（500 tokens，重疊 50 tokens）
     ↓
embed_chunks.py → ChromaDB 向量索引
  ├── 增量模式：跳過已存在的 chunk_id（預設）
  └── 全量重建：--fresh 旗標（重大 schema 變更後使用）
```

### chunk metadata 規範

```python
{
    "chunk_id":   "EKI-7720G-chunk-003",
    "product_pn": "EKI-7720G",           # 供 Hard Filter 的 where 條件使用
    "model_name": "EKI-7720G",
    "source":     "datasheet_EKI-7720G.md",
    "chunk_idx":  3
}
```

> `product_pn` 欄位是 F4 Layer 3 `where` 條件能正確過濾的關鍵，必須與 MongoDB 的 `product_pn` 格式一致。

### 分段驗證

- [ ] 增量模式不重複建立已存在的 chunk_id
- [ ] `where: {product_pn: {$in: candidates}}` 正確過濾（用已知型號測試）
- [ ] 新增 Datasheet 後，AI 回答能引用新資料

---

## F8：驗證、SOP 與維運

### 資料維護角色分工

| 角色 | 工作內容 | 工具 |
|---|---|---|
| PM | 維護型號、Application、Lifecycle | Google Sheet |
| RD 硬體組 | 維護硬體規格（Port / PoE / 電源 / firmware_ver） | Google Sheet |
| SW 軟體組 | 維護 SW Specs（三態值功能規格） | Google Sheet |
| 工程師 | 執行 sync 腳本、確認 validation_report.json | 本地腳本 |

### 新產品上架 SOP

```
① PM / RD 在 Google Sheet 新增一列
         ↓
② 填寫 Application、software_series、firmware_ver（必填三欄）
         ↓
③ 通知工程師執行 sync 腳本
         ↓
④ 確認 validation_report.json 無 ERROR
  └── 有 ERROR → 回覆 PM/RD 修正 → 重新執行
         ↓
⑤ 若有新 Datasheet → 轉 MD → 執行 embed_chunks.py（增量）
         ↓
⑥ AI 助理與選型工具即時感知新資料 ✅
```

### 常見問題排查

| 問題現象 | 可能原因 | 排查步驟 |
|---|---|---|
| 前端表格欄位顯示 undefined | `format_product()` 欄位名對不上 | 檢查 Flask API 回傳的 JSON key |
| Chatbot 不認識新型號 | ChromaDB 尚未更新 | 執行 embed_chunks.py |
| Chatbot 回答範圍不對 | selected_models 傳入錯誤 | 確認 `prod_name` 欄位存在且為完整料號 |
| sync 後 product_specs 資料舊 | is_latest 標記錯誤 | 檢查 mark_latest() 邏輯 |
| validation_report.json 有 FK 斷鍊 | firmware_ver 欄位填錯 | 確認 HW Tab 的 firmware_ver 值存在於 SW Specs Tab |

---

## 設計決策紀錄

| ID | 決策 | 狀態 | 說明 |
|---|---|---|---|
| D1 | 三態值以 `"full"/"optional"/"no"` 字串存儲，不轉布林 | ✅ 確認 | 保留「選配」語意 |
| D2 | 後台不建置 Admin UI，資料維護透過 Google Sheet | ✅ 確認 | 降低開發成本 |
| D3 | SW Series 複合名在腳本展開，不要求 PM 手動拆分 | ✅ 確認 | 降低維護複雜度 |
| D4 | `(software_series, firmware_ver)` 為 software_specs 複合主鍵 | ✅ 確認 | 保留不同 fw 版本的規格差異 |
| D5 | Ind SW / Train SW Tab 新增 `firmware_ver` 欄位 | ✅ 確認 | HW/SW 精準 JOIN 的關鍵 |
| D6 | RAG 採用 Hard Filter 優先 + 子集向量搜尋 + LLM Re-rank | ✅ 確認 | 提升準確率，避免語意漂移 |
| D7 | Application 標準值清單鎖定前，不開始 F3/F4/F5 開發 | ⚠️ 待確認 | 所有 Epic 的前置依賴 |
| D8 | 軟體功能的 MongoDB 查詢展開為多個 `$or` 條件 | ✅ 確認 | 萬用字元路徑在 MongoDB 不直接支援 |

---

## Epic 任務清單

### [F0] 資料格式確認與前置準備
- [ ] 與 PM 確認 Application 標準值清單，書面記錄並鎖定
- [ ] 輸出欄位規格書（Ind SW / Train SW / SW Specs 三個 Tab）
- [ ] 確認三態值規範，SW 組確認填寫規則
- [ ] 確認現有 Flask API 回傳欄位格式，與前端 `prod_*` 對齊
- [ ] 確認所有 SW Series 複合命名格式（含特殊格式）

### [F1] Google Sheet 建置
- [ ] 建立 Google Sheet 與三個工作表
- [ ] 貼入 TSV 初始資料
- [ ] 設定 Ind SW Port 計算公式 + PoE 驗證公式
- [ ] 設定 Train SW 公式 + 認證 TEXTJOIN 公式
- [ ] **[v4.0]** 新增 `firmware_ver` 欄位與動態下拉選單
- [ ] 設定 SW Specs 三態值下拉選單（●/○/-）
- [ ] 設定條件格式（PoE 超限 / 空白欄位 / EOL）
- [ ] Google Cloud Service Account 設定 + credentials.json
- [ ] 更新 .env（SHEET_ID / GOOGLE_CREDENTIALS_PATH）

### [F2] 資料同步腳本
- [ ] 實作 Google Sheets API 讀取（gspread）
- [ ] 實作 Ind SW / Train SW 資料轉換（正規化 / NaN 填充）
- [ ] **[v4.0]** 實作 `expand_series()`（複合系列名展開）
- [ ] **[v4.0]** 實作 `mark_latest()`（is_latest 標記）
- [ ] 實作三態值正規化
- [ ] 實作 ERROR 級驗證（product_pn / FK 斷鍊 / PoE 超限）
- [ ] 實作 WARN 級驗證（Port 總數不符 / 未知欄位）
- [ ] 實作 MongoDB 三層 upsert
- [ ] 實作 validation_report.json 輸出
- [ ] 建立 MongoDB Compound Index
- [ ] 首次全量同步測試

### [F3] 選型 API（Flask）
- [ ] 串接 MongoDB product_specs（取代原 JSON 檔）
- [ ] 實作 `/api/searchProdType`（即時搜尋）
- [ ] 實作 `/api/submitProdType`（條件篩選）
- [ ] 確認 `format_product()` 欄位與前端 `prod_*` 完全對齊
- [ ] **[v4.0]** 加入 Application 篩選條件支援
- [ ] 加入 lifecycle != EOL + is_latest = True 預設過濾
- [ ] 設定 CORS
- [ ] 端對端 API 測試

### [F4] RAG AI 助理（FastAPI）
- [ ] 實作意圖解析層（Gemini + JSON 解析防護）
- [ ] 實作 Hard Filter 層（MongoDB 候選子集）
- [ ] **[v4.0]** 向量搜尋改為只在候選子集內執行
- [ ] **[v4.0]** 實作 LLM Re-ranking 層（top-10 → top-3）
- [ ] 實作軟體功能 `$or` 條件展開
- [ ] 實作報告生成（含對話歷史）
- [ ] 實作 `/api/chat` 端點
- [ ] 設定 CORS
- [ ] 優化 Query Expansion 關鍵字（Application 語意對應）
- [ ] AI 查詢端對端測試（10 個測試問題）

### [F5] 前端頁面
- [ ] 新增 Application 篩選下拉選單
- [ ] 確認 POST body 新增 `application` 欄位
- [ ] 確認 `selected_models` 正確傳入 `/api/chat`（使用 `prod_name`）
- [ ] 端對端使用者流程測試

### [F6] 規格比對頁
- [ ] 頁面框架與 FastAPI 路由設定
- [ ] 型號搜尋與多選（最多 5 個）
- [ ] 多型號並排規格比對表格
- [ ] 三態值 Badge 視覺化（🟢/🟠/⚫）
- [ ] 全文搜尋與分類篩選
- [ ] Excel 匯出（SheetJS）

### [F7] ChromaDB 向量索引
- [ ] 確認 chunk metadata 包含 `product_pn` 欄位
- [ ] 確認增量更新機制（跳過已存在 chunk_id）
- [ ] 建立 Datasheet 清洗 SOP（PDF → MD → chunk → embed）
- [ ] 完成待更新型號的 Datasheet 補充
- [ ] 全量重建觸發條件與 SOP 文件化

### [F8] 驗證、SOP 與維運
- [ ] **[最優先]** Application 標準值清單確認（F0 對應）
- [ ] PM 填入 Application 欄位
- [ ] RD 填入 software_series 欄位
- [ ] **[v4.0]** RD 填入 firmware_ver 欄位
- [ ] SW 組確認 SW Specs 資料正確性（含 EKI-5700 fw 版本對應）
- [ ] validation_report 流程演練
- [ ] 新產品上架 SOP 文件化
- [ ] 常見問題排查文件建立

---

## 綜合路線圖

```
Week 1（本週）
  ├── [F0] Application 標準值清單確認（最優先，所有 Epic 前置依賴）
  ├── [F0] 欄位規格書輸出，各角色確認
  ├── [F1] Google Sheet 建立（三個 Tab + 公式 + 條件格式）
  └── [F1] firmware_ver 欄位 + 動態下拉

Week 2（下週）
  ├── [F1] Service Account 設定 + gspread 讀取測試
  ├── [F8] PM / RD 填入初始資料（Application + software_series + firmware_ver）
  ├── [F2] Sync 腳本開發（expand_series / mark_latest / validate）
  └── [F2] 首次全量同步 → G2 Gate 驗收

Week 3
  ├── [F3] 選型 API 開發（串接 MongoDB）+ G3 Gate 驗收
  ├── [F4] RAG 意圖解析 + Hard Filter 層
  └── [F7] ChromaDB chunk metadata 確認 + 增量更新測試

Week 4
  ├── [F4] 向量搜尋子集限制 + Re-ranking + 報告生成 → G4 Gate 驗收
  ├── [F5] 前端新增 Application 篩選 + 端對端整合 → G5 Gate 驗收
  └── [F8] SOP 文件化

Month 2
  ├── [F6] spec_viewer.html 規格比對頁
  ├── [F7] Datasheet 補充 + ChromaDB 更新
  └── 壓力測試 + 效能調優（Index / Re-ranking 延遲）

未來（規劃中）
  ├── Sync 腳本定期排程（cron）
  ├── MongoDB Schema Validation 強化
  └── Admin UI 評估（視使用量決定是否建置）
```

---

*文件維護者：每次架構決策變更後請更新「設計決策紀錄」章節，並更新頂部版本號與日期。*
