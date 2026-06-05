"""
app/api/chat.py
POST /api/chat — RAG Chatbot 端點（Phase 1：3 Stage Pipeline）

Pipeline：
  Stage 1：intent_parser  — 自然語言 → 結構化條件 JSON（Gemini Flash）
  Stage 2：hard_filter    — MongoDB Hard Filter → 候選型號（全量）
  Stage 5：report_generator — 候選規格 → Markdown 回答（Gemini Flash）

Phase 1 不包含：
  Stage 3（向量搜尋）、Stage 4（Re-ranking） → Phase 2 實作
"""

from fastapi import APIRouter, HTTPException
from app.models.chat import ChatRequest, ChatResponse
from app.rag.intent_parser import parse_intent
from app.rag.hard_filter import run_hard_filter
from app.rag.report_generator import generate_report

router = APIRouter()


@router.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest) -> ChatResponse:
    """
    RAG Chatbot 主端點。
    接收使用者問題 + 前端 context，執行 3-Stage Pipeline，回傳 Markdown 回答。
    """

    # ── Stage 1：意圖解析 ──────────────────────────────────────────────────
    # 失敗時 parse_intent 回傳空 IntentResult，後續走全庫搜尋
    intent = parse_intent(req.message)
    
    # 印出意圖解析結果供除錯與觀察
    print(f"\n[Chatbot] 使用者問題: {req.message}")
    print(f"[Chatbot] 解析意圖: {intent}\n")

    # ── Stage 2：MongoDB Hard Filter ──────────────────────────────────────
    # all_docs：全部符合型號（供 referenced_models 完整顯示）
    # top_docs：前 15 筆（傳給 LLM 做詳細分析）
    selected_models = req.context.selected_models or []
    all_docs, top_docs = run_hard_filter(intent, selected_models)

    # 若完全沒有候選型號，直接回傳找不到
    if not all_docs:
        return ChatResponse(
            answer="No matching models found. Please try relaxing your search criteria or adjusting your description.",
            referenced_models=[],
            sources=[],
        )

    # ── Stage 5：報告生成 ─────────────────────────────────────────────────
    history = [h.model_dump() for h in req.history]
    answer, referenced_models = generate_report(
        user_query=req.message,
        history=history,
        top_docs=top_docs,
        total_count=len(all_docs),
    )

    # referenced_models 顯示全部符合型號的 PN（不只 top_docs）
    all_pns = [doc.get("product_pn", "") for doc in all_docs if doc.get("product_pn")]

    return ChatResponse(
        answer=answer,
        referenced_models=all_pns,
        sources=[],  # Phase 1 無向量搜尋，sources 永遠空
    )
