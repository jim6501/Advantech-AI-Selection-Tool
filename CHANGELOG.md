# 更新日誌 (Changelog)

本文件記錄專案的重要變更，最新異動置頂。

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
