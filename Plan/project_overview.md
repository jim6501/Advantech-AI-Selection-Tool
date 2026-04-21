# 工業交換機規格資料庫與 AI 選型系統 — 專案整體規劃

> v1.0 — 2026-04-17

---

## 一、系統定位與功能範圍

本系統為 Advantech 工業交換機內部選型輔助工具，由兩個核心功能組成：

**硬體預篩選工具**（頁面主區域）：使用者設定管理類型、Port 數量、Application 等條件，後端查詢資料庫後以表格呈現符合的型號清單。

**AI 規格查詢 Chatbot**（右下角浮動面板）：使用者以自然語言詢問規格細節或應用建議，AI 自動感知篩選工具目前鎖定的型號範圍，回答聚焦在這些型號上。

兩個功能共用同一份 MongoDB 資料庫。

---

## 二、整體架構

```
資料維護（Google Sheet）
  Ind SW Tab / Train SW Tab / SW Specs Tab
          │
          │ sync_specs_to_mongo.py（工程師定期執行）
          ▼
MongoDB（三層 Collection）
  hardware_specs   ← 一份文件 = 一台設備
  software_specs   ← 一份文件 = 一系列 × 一 fw 版本
  product_specs    ← 自動合併，為查詢唯一入口
          │
    ┌─────┴──────┐
    ▼            ▼
Flask :5000    FastAPI :8000
選型 API       RAG AI 助理
    │            │
    └─────┬──────┘
          ▼
    前端 HTML（硬體篩選 + Chatbot）
          │
          ▼（Chatbot 查詢時使用）
       ChromaDB
    Datasheet 向量索引
```

---

## 三、元件清單

| 元件 | 技術 | 職責 |
|---|---|---|
| 資料來源 | Google Sheets | PM / RD / SW 組線上共編，唯一資料入口 |
| 同步腳本 | Python | Google Sheet → MongoDB，含驗證與報告輸出 |
| 資料庫 | MongoDB | 三層 Collection，product_specs 為查詢主層 |
| 選型後端 | Flask（:5000） | 硬體條件篩選 API |
| AI 後端 | FastAPI（:8000） | RAG 查詢，Hybrid Retrieval 架構 |
| LLM | Google Gemini | 意圖解析、Re-ranking、回答生成 |
| 向量資料庫 | ChromaDB | Datasheet 語意索引 |
| 前端 | HTML + JS | 硬體篩選頁面 + Chatbot 面板 |

---

## 四、完整資料流

### 4.1 資料寫入（維護端）

```
Google Sheet 更新
  → 工程師執行 sync 腳本
  → 讀取三個 Tab，驗證資料（ERROR / WARN）
  → 輸出 validation_report.json
  → 寫入 hardware_specs / software_specs / product_specs
  → 選型工具與 AI 即時感知新資料
```

### 4.2 使用者查詢（硬體篩選）

```
使用者設定篩選條件（管理類型 / Port 數 / Application）
  → POST /api/submitProdType（Flask :5000）
  → MongoDB Hard Filter（product_specs）
  → 回傳型號列表，前端渲染表格
  → Chatbot contextBar 自動更新已鎖定型號
```

### 4.3 使用者查詢（Chatbot）

```
使用者輸入自然語言問題
  → POST /api/chat（FastAPI :8000）
  → 意圖解析（Gemini）→ 抽出結構化條件
  → Hard Filter（MongoDB）→ 候選型號子集
  → 向量搜尋（ChromaDB）→ 只在子集內搜尋 top-10
  → Re-ranking（Gemini）→ top-3
  → 報告生成（Gemini）
  → 回傳 answer + referenced_models + sources
```

---

## 五、開發階段與順序

開發遵循「資料先行 → 後端 → 前端整合」的順序，F3 / F4 / F7 可平行開發。

```
F0  資料格式確認（Application 標準值、欄位規格書）   ← 所有 Epic 前置依賴
 ↓
F1  Google Sheet 建置（三個 Tab、公式、下拉、條件格式）
 ↓
F2  Sync 腳本（Sheet → MongoDB，含驗證與報告）
 ↓
F3  選型 API（Flask）  ─┐
F4  RAG AI 助理（FastAPI）├── 平行開發，共用 product_specs
F7  ChromaDB 向量索引  ─┘
 ↓
F5  前端整合（新增 Application 篩選、確認 context 傳遞）
 ↓
F6  規格比對頁（spec_viewer.html）                  ← 獨立功能，最後開發
 ↓
F8  驗證、SOP、維運文件                             ← 貫穿全程
```

---

## 六、各 Epic 簡述

| Epic | 說明 | 優先 | 前置依賴 |
|---|---|---|---|
| F0 資料格式確認 | 鎖定 Application 標準值、欄位規格書、三態值規範、現有 API 欄位格式 | 最高 | 無 |
| F1 Google Sheet | 建立三個 Tab，設定公式、下拉選單（含 firmware_ver）、條件格式 | 高 | F0 |
| F2 Sync 腳本 | Sheet → MongoDB，SW Series 展開、is_latest 標記、驗證規則、三層寫入 | 高 | F1 |
| F3 選型 API | Flask 串接 MongoDB，實作搜尋 + 條件篩選兩個端點 | 中 | F2 |
| F4 RAG AI 助理 | Hybrid Retrieval：意圖解析 → Hard Filter → 子集向量搜尋 → Re-rank → 生成 | 高 | F2、F7 |
| F5 前端整合 | 新增 Application 篩選 UI，確認 selected_models 正確傳入 Chatbot | 中 | F3、F4 |
| F6 規格比對頁 | 多型號並排比較、三態值 Badge、全文搜尋、Excel 匯出 | 低 | F3 |
| F7 向量索引 | ChromaDB 增量更新機制、Datasheet 補充、chunk metadata 規範 | 中 | 無 |
| F8 SOP 維運 | 新產品上架 SOP、validation_report 演練、角色分工文件 | 中 | F2 |

---

## 七、關鍵設計決策

| 決策 | 說明 |
|---|---|
| Google Sheet 為唯一資料入口 | PM / RD / SW 組直接在 Sheet 維護，不建 Admin UI |
| `(software_series, firmware_ver)` 為 SW 複合主鍵 | 保留不同 fw 版本的規格差異（如 EKI-5700 fw1.02 vs fw1.03 的 IEC 61850 差異） |
| SW Series 複合命名由腳本展開 | `EKI-5700/7400/7700` → 三筆獨立文件，PM 不需手動拆分 |
| 三態值存為字串而非布林 | `"full"/"optional"/"no"`，保留「選配」語意 |
| Hard Filter 優先於向量搜尋 | 向量搜尋只在 MongoDB 篩出的候選子集內執行，避免語意漂移 |
| Application 標準值必須在 F1 前鎖定 | 影響 Sheet 下拉選單、MongoDB index、前端 UI、RAG 關鍵字對應 |

---

## 八、分段驗收閘門

| 閘門 | 時機 | 驗收標準 |
|---|---|---|
| G0 | F0 完成 | Application 標準值清單書面確認，欄位規格書各角色簽認 |
| G1 | F1 完成 | Sheet 公式正確，firmware_ver 下拉與 SW Specs 連動，Service Account 可讀取 |
| G2 | F2 完成 | validation_report.json 無 ERROR，三層 Collection 資料正確，Index 建立完成 |
| G3 | F3 完成 | 篩選結果正確，`prod_name` 欄位存在且為完整料號，前端表格正確渲染 |
| G4 | F4 完成 | 意圖解析 + Hard Filter + Re-ranking 流程正確，AI 回答限縮在鎖定型號範圍內 |
| G5 | F5 完成 | Application 篩選有效，端對端：篩選 → Chatbot context → 正確回答 |

---

## 九、路線圖

```
Week 1   F0 資料格式確認 → F1 Google Sheet 建置
Week 2   F8 PM/RD 填入資料 → F2 Sync 腳本開發 → G2 驗收
Week 3   F3 選型 API + F4 RAG（意圖解析 + Hard Filter）+ F7 向量索引確認
Week 4   F4 Re-ranking + 生成 → G4 驗收 → F5 前端整合 → G5 驗收
Month 2  F6 規格比對頁 + F8 SOP 文件 + 壓力測試
未來     Sync 排程自動化、Schema Validation 強化、Admin UI 評估
```
