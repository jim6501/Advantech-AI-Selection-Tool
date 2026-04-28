"""
app/rag/report_generator.py
Stage 5：根據候選型號規格生成自然語言回答。

【設計重點】
- 透過 LLM Gateway 呼叫 Gemini Flash
- 傳入的規格資料只取 top_docs（15 筆以內），避免 prompt 過長
- 規格只摘要必要欄位，避免傳入整份 MongoDB 文件（太多雜訊）
- LLM 禁止捏造數值，所有規格必須來自傳入的資料
- 回傳 (answer_markdown, referenced_models)
"""

import json
from app.llm_gateway import get_gateway


# ── 規格欄位摘要（只取前端表格用到的欄位，避免 prompt 過載）──────────────
def _summarize_doc(doc: dict) -> dict:
    """從 MongoDB 文件中抽取關鍵欄位，生成精簡摘要傳給 LLM。"""
    hw = doc.get("hardware", {})
    sw = doc.get("software", {})

    # 軟體功能：只列出 "full" 或 "optional" 的項目
    sw_supported = {}
    for category, features in sw.items():
        if isinstance(features, dict):
            supported = {
                k: v for k, v in features.items()
                if v in ("full", "optional")
            }
            if supported:
                sw_supported[category] = supported

    return {
        "product_pn":   doc.get("product_pn", ""),
        "model_name":   doc.get("model_name", hw.get("Model Name", "")),
        "function":     hw.get("Function", ""),
        "port_numbers": hw.get("Port Numbers", ""),
        "temp_grade":   hw.get("Temp Grade", ""),
        "application":  hw.get("Application", ""),
        "lifecycle":    hw.get("PLM Lifecycle", ""),
        "software":     sw_supported,
        # Port 細節 (動態抓取非零的連接埠資訊，支援 Train SW 與 Ind SW)
        "ports": {
            k: v for k, v in hw.items()
            if any(keyword in k for keyword in ["RJ-45", "Fiber", "PoE", "Combo", "D-code", "X-code", "10G", "100M"])
            and "驗證" not in k
            and v not in (0, "0", "", None, "None")
        }
    }


def _build_report_prompt(
    user_query: str,
    history: list[dict],
    top_docs: list[dict],
    total_count: int,
) -> str:
    """建構報告生成的 Prompt。"""

    # 規格摘要 JSON
    summaries = [_summarize_doc(doc) for doc in top_docs]
    specs_json = json.dumps(summaries, ensure_ascii=False, indent=2)

    # 對話歷史（最多 6 輪，避免 token 過長）
    history_text = ""
    if history:
        history_text = "\n".join(
            f"{'使用者' if h['role'] == 'user' else 'AI'}：{h['content']}"
            for h in history[-6:]
        )

    # 超過 TOP_N 時的提醒文字
    overflow_note = ""
    if total_count > len(top_docs):
        overflow_note = (
            f"\n（注意：符合條件的型號共 {total_count} 款，"
            f"以下僅分析前 {len(top_docs)} 款規格。完整清單請參考「參考型號」區塊。）"
        )

    return f"""你是 Advantech 工業交換機選型 AI 助手。
請根據以下**真實規格資料**回答使用者問題。{overflow_note}

回答規則：
1. 只能引用以下規格資料中存在的資訊，**嚴禁推斷或捏造規格數值**
2. 回答使用**繁體中文**，格式使用 **Markdown**
3. 推薦型號時必須說明具體理由（對應哪個規格符合需求）
4. 如果規格資料不足以回答問題，請明確說明「目前規格資料不足以回答此問題」
5. 回答末尾附上被分析的型號清單

---
對話上下文（最近幾輪）：
{history_text if history_text else "（無歷史對話）"}

---
使用者問題：{user_query}

---
候選型號規格資料（共 {len(top_docs)} 款）：
{specs_json}
"""


def generate_report(
    user_query: str,
    history: list[dict],
    top_docs: list[dict],
    total_count: int,
) -> tuple[str, list[str]]:
    """
    主要入口：生成 Markdown 格式回答。

    回傳：
      answer (str)             — Markdown 回答
      referenced_models (list) — 本次分析的型號 PN 清單
    """
    referenced_models = [
        doc.get("product_pn", doc.get("model_name", ""))
        for doc in top_docs
    ]

    if not top_docs:
        return "找不到符合條件的型號，請嘗試放寬篩選條件。", []

    prompt = _build_report_prompt(user_query, history, top_docs, total_count)

    try:
        gateway = get_gateway()
        answer = gateway.call("report", prompt)
    except RuntimeError as e:
        # LLM 限流或失敗 → 回傳友善錯誤訊息
        answer = f"⚠️ AI 服務暫時無法回應：{e}"

    return answer, referenced_models
