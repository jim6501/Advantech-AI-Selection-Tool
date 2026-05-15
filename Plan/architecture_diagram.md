# 🏗️ Advantech AI Selection Tool - System Architecture

這份架構圖展示了系統的模組化結構。藍色區塊代表 **Sprint 1 已完成** 的功能，橘色虛線區塊代表 **Sprint 2 預計開發** 的 RAG 進階功能。

```mermaid
graph TB
    subgraph Frontend ["🎨 前端介面 (Vanilla JS / HTML5 / CSS3)"]
        direction TB
        UI[Glassmorphism UI]
        ST[應用場景模板 scenes.js]
        SI[搜尋與模糊比對 Search Inventory]
        CHAT[AI 對話視窗 Chatbot UI]
        COMP["📊 產品比較視窗 (Planned)"]
        
        style COMP stroke-dasharray: 5 5, fill:#fff4e6, stroke:#d4a017
    end

    subgraph Backend ["⚙️ 後端核心 (FastAPI / Python)"]
        direction TB
        API[FastAPI Router]
        
        subgraph Logic ["搜尋與篩選引擎"]
            SEL[selection.py - MongoDB 查詢與 Regex 比對]
            SYNC[sync_scripts - 資料同步與清理]
        end

        subgraph RAG ["RAG AI 流程管線"]
            IP[intent_parser.py - 意圖解析]
            HF[hard_filter.py - 硬體條件轉換]
            RG[report_generator.py - 規格報告生成]
            VEC["🗄️ Vector Retrieval (Planned)"]
            PDF["📄 Word/PDF Generator (Planned)"]
            
            style VEC stroke-dasharray: 5 5, fill:#fff4e6, stroke:#d4a017
            style PDF stroke-dasharray: 5 5, fill:#fff4e6, stroke:#d4a017
        end
        
        GW[llm_gateway.py - Gemini API 安全呼叫層]
    end

    subgraph Data ["💾 資料層 (Data Layer)"]
        MDB[(MongoDB - Product Specs)]
        GS[Google Sheets - 原始維護表]
        VDB["📦 MongoDB Atlas Vector Search (Planned)"]
        
        style VDB stroke-dasharray: 5 5, fill:#fff4e6, stroke:#d4a017
    end

    %% 連線關係
    GS --> SYNC --> MDB
    Frontend <--> API
    API <--> Logic
    API <--> RAG
    Logic <--> MDB
    RAG <--> GW
    RAG <--> MDB
    
    %% 未來連線
    VEC -.-> VDB
    CHAT -.-> VEC
    RG -.-> PDF
```

---

## 🔄 系統核心流程 (System Workflows)

為了呈現各模組間的連動，以下拆解為兩大核心路徑：

### 1. 條件篩選與場景套用流程 (Filter & Scene Flow)
這是使用者透過介面手動選型或套用模板的過程。

```mermaid
flowchart LR
    A[使用者介面] -->|1. 點選場景| B[scenes.js]
    B -->|2. 填入預設值| C[前端篩選狀態]
    A -->|1. 手動調整| C
    C -->|3. POST /submitProdType| D[selection.py]
    D -->|4. Regex/GTE 查詢| E[(MongoDB)]
    E -->|5. 回傳產品清單| D
    D -->|6. 更新表格| A
    C -.->|7. 偵測修改| F[顯示恢復預設按鈕]
```

### 2. AI 互動與 RAG 處理流程 (AI Chatbot / RAG Flow)
這是使用者在對話視窗輸入自然語言時，系統內部的 3-Stage 處理過程。

```mermaid
sequenceDiagram
    participant User as 使用者
    participant UI as 前端介面
    participant API as FastAPI Router
    participant RAG as RAG Pipeline
    participant DB as MongoDB
    participant LLM as Gemini API

    User->>UI: 輸入「我想找 8 Port 寬溫 Managed Switch」
    UI->>API: POST /api/chat (含目前型號清單)
    API->>RAG: 啟動意圖解析 (Intent Parser)
    RAG->>LLM: 轉化為 JSON 篩選條件
    LLM-->>RAG: {mgmt: 'managed', temp: 'wide', ports: 8}
    RAG->>DB: 執行資料庫篩選 (Hard Filter)
    DB-->>RAG: 回傳產品規格資料
    RAG->>LLM: 規格彙整與報告生成 (Report Gen)
    LLM-->>API: 生成 Markdown 建議報告
    API-->>UI: 呈現 AI 回答 + 參考型號 Chip
    UI-->>User: 看到最終建議
```

### 3. 資料維護管線 (Data Maintenance)
RD 與 PM 維護規格資料的流程。

```mermaid
flowchart TD
    PM[Google Sheets 規格表] -->|填寫完成| RD[執行同步腳本]
    RD -->|fetch_specs| Clean[欄位清理/合併儲存格處理]
    Clean -->|sync_to_mongo| Join[硬體 + 軟體自動關聯]
    Join -->|Update| MDB[(MongoDB)]
```

## 🧩 模組說明

### 1. 已完成部分 (Sprint 1)
- **Data-Driven 結構**：透過自動化腳本將 Google Sheets 複雜規格清洗並 Join 後存入 MongoDB。
- **混合篩選引擎**：
    - **手動模式**：支援 Port 數 GTE 查詢與 Management Type 的 Regex 模糊比對。
    - **場景模式**：由 `scenes.js` 提供預設條件，並具備「修改偵測」與「恢復預設」機制。
- **RAG 1.0 (Text-to-SQL)**：AI 能夠理解自然語言，將其轉為結構化的 MongoDB 指令（Intent Parsing），並輸出規格比較報告。
- **LLM Gateway**：具備自動重試與 API 日誌紀錄功能的 Gemini 核心介面。

### 2. 未來計畫 (Sprint 2+)
- **向量檢索整合**：導入 MongoDB Atlas Vector Search 處理 PDF 使用手冊，實現完整的 RAG 檢索增強生成。
- **自動化報告輸出**：將 AI 建議直接轉換為 Word 或 PDF 格式供業務下載。
- **橫向比較功能**：實作 UI 面板讓使用者能橫向對比多台設備細節。
