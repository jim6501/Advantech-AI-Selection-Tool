"""
app/api/chat.py
POST /api/chat — RAG Chatbot 端點（Phase 1：3 Stage Pipeline + Type B 型號規格查詢）

Pipeline：
  Stage 0：model_detector  — 偵測問題是否明確提到型號（EKI-/ADAM-），
                              命中則直接走 Type B（自建 Datasheet Chunk 向量搜尋，見 vector_search.py）
  Stage 1：intent_parser  — 自然語言 → 結構化條件 JSON（Gemini Flash）
  Stage 2：hard_filter    — MongoDB Hard Filter → 候選型號（全量）
  Stage 5：report_generator — 候選規格 → Markdown 回答（Gemini Flash）

Phase 1 不包含：
  Stage 4（Re-ranking） → Phase 2 實作

Type B 設計依據：Plan/chatbot_query_routing_design.md

【Type B 目前以自建向量搜尋為主】
vector_search.py（自建、可控、有 sources 可驗證）是 Type B 的正式路徑。
datasheet_expert.py（外部 Product Expert API，黑盒、無 sources）目前只在
CHAT_TEST_MODE=datasheet_api 底下供評估可靠度，尚未達到正式併入路由的門檻，
不會出現在正式（未設 CHAT_TEST_MODE）的請求路徑上。

【CHAT_TEST_MODE 測試開關】
.env 設 CHAT_TEST_MODE 時，原本的 3-Stage Pipeline（Stage 1/2/5）整個停用，方便單獨測試新串接的
元件，不受 MongoDB / intent_parser 等既有流程影響。測試完把這個變數改回空值或刪除即可還原。
可用值：
  "datasheet_api" — 所有訊息一律直接打 Datasheet Product Expert API（外部黑盒服務，評估用）
  "vector_search" — 所有訊息一律直接對 EKI_DataSheet_Chunks 做向量搜尋 + LLM 生成回答（自建 Stage 3）
"""

import os
from fastapi import APIRouter, HTTPException
from app.models.chat import ChatRequest, ChatResponse
from app.rag.intent_parser import parse_intent
from app.rag.hard_filter import run_hard_filter
from app.rag.report_generator import generate_report
from app.rag.model_detector import detect_models
from app.rag.datasheet_expert import ask_product_expert
from app.rag.vector_search import answer_from_chunks

router = APIRouter()

CHAT_TEST_MODE = os.getenv("CHAT_TEST_MODE", "").strip().lower()


def _resolve_target_models(message: str, context_models: list[str]) -> tuple[list[str], bool]:
    """
    決定這次查詢要鎖定哪些型號。
    優先用訊息裡明確提到的型號；訊息沒提到才 fallback 用前端已篩選的型號（Stage 1 選型結果）。
    回傳 (target_models, from_context)：from_context=True 代表型號是從前端篩選帶入，
    不是使用者自己打的，呼叫外部 API 時需要把型號名稱寫進 query 文字裡才看得到。
    """
    models_in_text = detect_models(message)
    if models_in_text:
        return models_in_text, False
    if context_models:
        return context_models, True
    return [], False


def _build_datasheet_query(message: str, target_models: list[str], from_context: bool) -> str:
    """
    Product Expert API 是無狀態服務，看不到網站前端的篩選狀態，
    型號是從 context 帶入時（使用者沒有在訊息裡打型號），需明確寫進 query 文字。
    """
    if from_context and target_models:
        models_str = "、".join(target_models)
        return f"（使用者已在網站篩選出以下型號：{models_str}）\n{message}"
    return message


@router.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest) -> ChatResponse:
    """
    RAG Chatbot 主端點。
    接收使用者問題 + 前端 context，執行 3-Stage Pipeline，回傳 Markdown 回答。
    """
    context_models = req.context.selected_models or []

    # ── 測試模式：原本 3-Stage Pipeline 整個停用，一律直接打 Datasheet API ──
    if CHAT_TEST_MODE == "datasheet_api":
        target_models, from_context = _resolve_target_models(req.message, context_models)
        query = _build_datasheet_query(req.message, target_models, from_context)
        print(f"\n[Chatbot] (CHAT_TEST_MODE=datasheet_api) 使用者問題: {req.message}")
        print(f"[Chatbot] 目標型號: {target_models}（來源: {'前端選型' if from_context else '訊息文字'}）\n")
        try:
            answer = ask_product_expert(query)
        except RuntimeError as e:
            answer = f"⚠️ Datasheet API 呼叫失敗：{e}"
        return ChatResponse(
            answer=answer,
            referenced_models=target_models,
            sources=[],
        )

    # ── 測試模式：原本 3-Stage Pipeline 整個停用，一律直接對 Datasheet Chunk 做向量搜尋 ──
    if CHAT_TEST_MODE == "vector_search":
        target_models, _ = _resolve_target_models(req.message, context_models)
        print(f"\n[Chatbot] (CHAT_TEST_MODE=vector_search) 使用者問題: {req.message}")
        print(f"[Chatbot] 目標型號（過濾優先，無結果會退回全庫搜尋）: {target_models}\n")
        try:
            answer, referenced_models, sources = answer_from_chunks(req.message, target_models)
        except Exception as e:
            answer, referenced_models, sources = f"⚠️ 向量搜尋測試模式失敗：{e}", [], []
        return ChatResponse(
            answer=answer,
            referenced_models=referenced_models,
            sources=sources,
        )

    # ── Stage 0：型號偵測（Type B）───────────────────────────────────────
    # 問題明確提到型號，或前端已篩選型號 → 優先對 Datasheet Chunk 做向量搜尋，跳過 Hard Filter。
    target_models, from_context = _resolve_target_models(req.message, context_models)
    if target_models:
        try:
            answer, referenced_models, sources = answer_from_chunks(req.message, target_models)
            if referenced_models:
                print(f"\n[Chatbot] 使用者問題: {req.message}")
                print(f"[Chatbot] Type B 向量搜尋命中: {target_models}\n")
                return ChatResponse(
                    answer=answer,
                    referenced_models=referenced_models,
                    sources=sources,
                )
            print(f"[Chatbot] Type B 向量搜尋查無資料（{target_models}）")

            # 型號是使用者在訊息文字裡明確打的（不是前端篩選帶入）→ hard_filter 只認
            # context.selected_models 的精確 PN，無法用文字裡的型號名稱篩選，Stage 1-2-5
            # fallback 只會查出全庫、答非所問，不如直接把向量搜尋「查無資料」的誠實回覆給使用者。
            if not from_context:
                return ChatResponse(answer=answer, referenced_models=[], sources=[])

            print("[Chatbot] 型號來自前端選型，fallback 回 3-Stage Pipeline（hard_filter 可用精確 PN 篩選）")
        except Exception as e:
            print(f"[Chatbot] 向量搜尋失敗，fallback 回 3-Stage Pipeline：{e}")

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
