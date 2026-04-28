"""
app/models/chat.py
Chatbot API 的 Pydantic Request / Response 強型別定義。

設計原則：
- ChatRequest  對應前端 app.js 送出的 payload 格式
- ChatResponse 對應前端 appendMessage() 期待收到的格式
- sources 在 Phase 1 永遠回傳空陣列（Phase 2 才有 Datasheet chunk）
"""

from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


# =========================================================================
# Request Models
# =========================================================================

class ChatContext(BaseModel):
    """
    前端帶入的篩選上下文。
    selected_models: 硬體篩選後鎖定的型號 PN 清單
    filters:         目前的篩選條件（type / port），供意圖解析參考
    """
    selected_models: List[str] = Field(default=[], description="已鎖定的型號 PN 清單")
    filters: Dict[str, Any] = Field(default={}, description="目前的篩選條件")


class HistoryItem(BaseModel):
    """
    單筆對話歷史記錄。
    role:    "user" 或 "assistant"
    content: 對話內容文字
    """
    role: str = Field(..., description="user 或 assistant")
    content: str = Field(..., description="對話內容")


class ChatRequest(BaseModel):
    """
    POST /api/chat 的請求體。
    對應前端 sendMessage() 送出的 payload。
    """
    message: str = Field(..., description="使用者輸入的問題")
    context: ChatContext = Field(default_factory=ChatContext, description="前端篩選上下文")
    history: List[HistoryItem] = Field(default=[], description="最近 12 筆對話歷史")


# =========================================================================
# Response Models
# =========================================================================

class SourceChunk(BaseModel):
    """
    單筆 Datasheet 知識庫引用片段（Phase 2 才會有內容）。
    """
    model: str = ""
    content: str = ""
    distance: float = 1.0


class ChatResponse(BaseModel):
    """
    POST /api/chat 的回傳體。
    對應前端 appendMessage() 使用的欄位。
    """
    answer: str = Field(..., description="AI 生成的 Markdown 格式回答")
    referenced_models: List[str] = Field(
        default=[], description="本次回答中參考的型號 PN 清單"
    )
    sources: List[SourceChunk] = Field(
        default=[], description="Phase 1 永遠空；Phase 2 填入 Datasheet chunk"
    )
