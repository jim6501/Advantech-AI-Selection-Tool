# MongoDB 整合與自動同步腳本實作計畫

本計畫旨在實作核心腳本 `scripts/sync_specs_to_mongo.py`，將已處理為 JSON 格式的硬體表 (`hardware_specs_raw.json`) 與軟體表 (`software_specs_raw.json`) 進行自動正規化驗證、合併 (JOIN)，並寫入至 MongoDB Atlas 資料庫。

## User Review Required

> [!IMPORTANT]
> **MongoDB 連線字串設定**：我們需要一組 MongoDB Atlas 的連線字串 (URI)。這必須寫在您的 `configs/.env` 當中。
> 請在 `.env` 新增一行：`MONGO_URI=mongodb+srv://<帳號>:<密碼>@<您的叢集>.mongodb.net/?retryWrites=true&w=majority&appName=<AppName>`

> [!WARNING]
> **空值與不相符策略 (Missing Mapping Strategy)**：
> 在合併過程中，如果某台硬體設備（如 `EKI-7720`）填寫了 `Software Series: EKI-7700`、`Firmware: 1.03.XX`，但是軟體表中**找不到**這個組合，腳本預設會將該硬體設為 `BLOCKED`，**拒絕寫入** `product_specs`，以確保推薦給用戶的設備不會發生缺少軟體規格的空洞狀況。請確認此防呆機制符合您的期望。

## Proposed Changes

### Database Layer (MongoDB)

#### [NEW] `hardware_specs` Collection
- 儲存來自 `Ind. SW` 與 `Train SW` 的獨立硬體資料
- 主鍵：依據 `product_pn` (商品型號)

#### [NEW] `software_specs` Collection
- 儲存來自 `SW Version` 拆展後的軟體資料
- 主鍵：依據 `{software_series}::{firmware_ver}` 複合字串

#### [NEW] `product_specs` Collection
- 合併計算後的完整選型主庫
- 將 `hardware` JSON 節點與 `software` JSON 節點進行實體合併
- 增加 `is_latest` 標記（腳本會自動判斷同一 `software_series` 中，哪個 `firmware_ver` 是最新版，並將其標示為 `true`，供預設搜尋使用）。

---

### Backend Scripts (MongoDB Sync)

#### [MODIFY] `configs/.env.example`
新增 `MONGO_URI` 與 `MONGO_DB_NAME=advantech_switches` 欄位供團隊成員參考。

#### [NEW] `scripts/sync_specs_to_mongo.py`
實作步驟包含：
1. **讀取端點**：預設讀取 `data/hardware_specs_raw.json` 及 `data/software_specs_raw.json`（避免頻繁叩擊 Google API）。
2. **Upsert Software**：寫入 `software_specs`，並透過 `is_latest` 邏輯判定所有版本大小（例如 `5.00.XX` > `1.03.XX`）。
3. **Upsert Hardware**：根據硬體型號將資料寫入 `hardware_specs`。
4. **Merge Phase (JOIN)**：
   - 遍歷每一台硬體，取出它的 `software_series` 和 `firmware_ver`。
   - 尋找對應的軟體規格。
   - 若對應成功，合併成一個標準 Document，寫入 `product_specs`。
   - 如果對應失敗，記錄於自動生成的 `data/validation_report.json` 錯誤報告中協助 PM 排錯。
5. **Create Indexes**：自動幫 MongoDB 建立加速用的複合檢索索引 (Compound Indexes)。

## Open Questions

> [!NOTE]
> 1. 您目前已經申請好 MongoDB Atlas 的叢集並擁有連線字串 (MONGO_URI) 了嗎？
> 2. `Firmware` 版本號的判斷邏輯，目前的格式大多是 `X.XX.XX`。如果腳本統一使用 Python 的 `packaging.version` 模組來判定大小決定誰是 `is_latest`，這樣的通用設計是否可行？

## Verification Plan

### Automated Tests
- 執行 `uv run scripts/sync_specs_to_mongo.py`
- 觀察 Console 的 Merge 成功 / 失敗筆數統計。

### Manual Verification
- 進入 MongoDB Atlas 原廠的資料 GUI 工具查看。
- 檢查 `product_specs` 集合，任意抽點一台交換機，確認 `hardware` 陣列跟 `software` 陣列是否有完美的整併在一份 Document 中。
- 檢查 `validation_report.json` 確認哪些型號的合併遇到了孤兒狀態（硬體表與軟體表的字眼完全對不起來的地方）。
