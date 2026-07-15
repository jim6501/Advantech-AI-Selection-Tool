# 更新日誌 (Changelog)

本文件記錄專案的重要變更，最新異動置頂。

---

## 2026-07-15

### Chatbot Type B：新增型號規格問答（向量搜尋 / Datasheet API 兩條路線）
- **自建向量搜尋成為正式路徑**（[app/rag/vector_search.py](app/rag/vector_search.py)）：使用者問題明確提到型號、或前端已篩選型號時，
  對 Datasheet Chunk（`Adv_Ind_Switch.EKI_DataSheet_Chunks`，MongoDB Atlas `$vectorSearch`）做語意搜尋，回傳的
  `sources` 欄位（型號、相似度、完整原文）第一次被真正填入，前端可核對 AI 引用的原文是否精準。
- **外部 Datasheet Product Expert API 整合**（[app/rag/datasheet_expert.py](app/rag/datasheet_expert.py)、
  [app/rag/model_detector.py](app/rag/model_detector.py)）：串接 Advantech 內部 presalesbot 服務作為備選方案，
  目前僅供可靠度評估（`CHAT_TEST_MODE=datasheet_api`），未進入正式路由，因為是外部黑盒、無法提供可驗證的
  `sources` 引用。
- **路由邏輯**（[app/api/chat.py](app/api/chat.py)）：Type B 優先呼叫向量搜尋；只有型號來自前端已選型號（`hard_filter`
  可用精確 PN 篩選）才 fallback 回原本 3-Stage Pipeline，型號是使用者在文字裡打的且查無資料時直接誠實回覆，
  避免 fallback 撈出全庫近 250 筆不相關型號、答非所問。
- **新增 `CHAT_TEST_MODE` 測試開關**（`configs/.env`）：可強制單一路徑（`datasheet_api` / `vector_search`）測試，
  不受既有 3-Stage Pipeline 影響。

### 修正
- **型號命名比對不完整**（[app/rag/vector_search.py](app/rag/vector_search.py)）：主資料庫 PN 帶地區/包裝後綴
  （`EKI-2525I-LA-AE`），Datasheet Chunk 存的是不含後綴的基礎型號（`EKI-2525I-LA`），原邏輯只處理「PN 比 chunk
  型號長」的方向；使用者只打基礎型號（`EKI-7720G`）時完全查無資料。新增反方向比對：基礎型號會抓出該系列
  底下所有變體（`EKI-7720G-4F`/`-4FI`/`-4FPI`）。
- **向量搜尋 `limit` 排序截斷漏型號**（[app/rag/vector_search.py](app/rag/vector_search.py)）：型號範圍已知時，
  固定 `limit=8` 會讓「哪些型號符合 X」這類列舉型問題因排序沒進前 8 名而漏掉本來有資料的型號。改為型號範圍已知時
  動態拉高 limit（型號數 ×6，上限 80）；查無資料的型號也會在回答裡明確列出，不再靜默略過。
- **LLM 回答被莫名截斷**（[app/llm_gateway.py](app/llm_gateway.py)）：`gemini-2.5-flash` 的思考 token
  （`thoughts_token_count`）跟輸出 token 共用 `max_output_tokens` 額度，context 一大就把答案截斷在奇怪的地方。
  加 `thinking_config.thinking_budget=0` 關閉思考模式、額度由 4096 拉到 8192，此修正影響全專案所有 LLM 呼叫
  （intent_parser / report_generator 也受益），非僅本次新功能。

### Chatbot 前端：浮動視窗改版
- **面板改為可拖曳、可縮放的浮動視窗**（[frontend/index.html](frontend/index.html)、
  [frontend/css/style.css](frontend/css/style.css)、[frontend/js/app.js](frontend/js/app.js)）：取代原本貼右側的
  固定側欄，抓標題列拖曳移動位置、抓右下角把手縮放大小，位置/大小記憶存 localStorage。
- **並排顯示 AI 回答與參考原文片段**：新增獨立的「AI 參考的原廠規格片段」欄位，取代原本每則訊息下方
  `max-height:150px` 的收合區塊，方便核對 AI 引用內容是否精準。
- **左右欄可自由調整比例、可完全收合**：中間新增可拖曳分隔線（`#chatColResizer`，寬度記憶、有最小寬度保護），
  標題列新增 📑 按鈕可完全收起參考片段區、對話區補滿全寬，再點一次恢復記憶寬度。
- **修正視窗縮小時面板跑出可視範圍的 bug**：新增 `resize` 事件監聽即時夾住面板位置/大小，避免瀏覽器視窗縮小後
  按鈕點不到。

### 設定與依賴
- `configs/.env` / `.env.example`：新增 `PRODUCT_API_URL/KEY/TIMEOUT`、`CHAT_TEST_MODE`（原散落在
  `Datasheet/.env` 的設定已合併並刪除該檔）。
- `pyproject.toml`：補上 `httpx` 為直接依賴（原僅為 `google-genai` 的間接依賴，現被 `datasheet_expert.py` 直接
  import）。

---

## 2026-07-09

### Table View 版面密度優化
- **凍結表頭 + 列高壓縮**：表格改為固定高度、內部捲動，並修正表頭 sticky 失效的問題（[style.css](frontend/css/style.css)、[table-view.css](frontend/css/table-view.css)）；整體列高壓縮，一屏可看更多筆資料。
- **Mgmt / Certifications 欄位改版**（[app.js](frontend/js/app.js)）：管理類型改以縮寫徽章（U/L2/L3/L2-M/L3-M）顯示於型號名稱旁；Certifications 改為獨立可開關欄位（取代原本的 Application 欄）。
- **欄位群組改用整欄底色**：RJ-45 / Fiber / M12 欄位群以底色區分取代邊框線，窄欄位標題可顯示縮寫（shortLabel）。

### 修正
- **軟體規格合併 fallback 邏輯錯誤**（[scripts/sync_specs_to_mongo.py](scripts/sync_specs_to_mongo.py)）：
  硬體規格表若沒有填寫 `Software Series` / `Firmware Version`，且從 PN 推導出的系列在軟體規格表中找不到對應資料時，
  原本會強制 fallback 套用一個寫死、完全不相關的系列（`EKI-5500`）的完整軟體功能表，導致例如
  `EKI-2710E-2CI-A`（真實硬體規格為 Unmanaged）被錯誤附加上 VLAN / SNMP / CLI 等 managed 功能。
  現在改為：找不到真正對應的軟體系列時，`software` 欄位留空，不再套用不相關資料；硬體資料仍正常寫入
  `product_specs`，產品不會從選型工具中消失。

### AI 對比摘要
- **移除「Best Fit Scenarios」段落**（[app/rag/compare_summary.py](app/rag/compare_summary.py)）：目前不規劃此段落，AI
  比較摘要僅保留「Key Differences」與「Recommendation」。

### Table View / Search Inventory / Advanced Filter 調整
- **移除 Application 欄位與分類**：Table View 的 App 欄位、Search Inventory 快速搜尋、Advanced Filter 均不再提供
  依「應用場景」（Application）篩選，相關後端動態分類與查詢邏輯一併移除（[app/api/selection.py](app/api/selection.py)、
  [frontend/js/app.js](frontend/js/app.js)）。
- **Search Inventory 暫時僅顯示硬體規格**：軟體規格資料尚未確認完成，快速搜尋文字框先只回傳硬體類特徵（Power
  Input / Connector Type / Port Feature / Hardware Feature / Certifications），可透過
  `SEARCH_INVENTORY_HARDWARE_ONLY` 旗標（[app/api/selection.py](app/api/selection.py)）一鍵恢復。
- **Advanced Filter 卡片重新分類**（[frontend/js/feature-selector.js](frontend/js/feature-selector.js)）：
  - 同樣因軟體規格尚未確認，暫時只顯示硬體相關卡片（`FS_SOFTWARE_HIDDEN` 旗標控制，之後可一鍵恢復顯示全部）。
  - 原本雜亂的「Hardware Specs」catch-all 拆分為四張語意清楚的卡片：
    - **Port Type / Connector**：PoE / Fiber / RJ-45 有無、M12 Connector、LAN Bypass。
    - **Power Input**：DC / AC / 12V / 24V / High Voltage。
    - **Certifications**：UL / LVD / IEC 61850 / NEMA / EN 50155 / E-Mark / ITxPT（新增獨立分類，後端
      category 由散落在 `Hardware Feature` 改為獨立的 `Certifications`）。
    - **Hardware Specs**：暫時僅保留 Temp_Wide，日後有新雜項硬體條件再擴充。
  - 移除與左側 Wizard 步驟重複的項目：`Port_RJ45_GbE/100M`、`Port_Fiber_GbE/10G`、`Port_M12_GbE`、
    `Port_MultiGiga`、`Speed_100M/GbE/10G`（皆與 Wizard 的 Max Port Speed 概念重疊），避免同一條件在兩處都能設定。
  - 後端 `Port Speed` 分類更名為 `Connector Type`，更準確反映隱藏速度相關項目後的實際內容。

---
