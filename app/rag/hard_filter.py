"""
app/rag/hard_filter.py
Stage 2：根據 IntentResult 和前端 context 組裝 MongoDB query，查詢候選型號。

【設計重點】
- 複用 selection.py 的 make_sw_expr_query（避免重複維護查詢邏輯）
- 若前端有 selected_models，則優先限縮在此範圍內
- 全部符合的型號都回傳（不設上限），讓 report_generator 決定取幾筆做詳細分析
- 回傳 (all_docs, top_docs)：
    all_docs  → 所有符合型號（供 referenced_models 顯示用）
    top_docs  → 前 N 筆完整規格（供 LLM 生成詳細回答用）
"""

from typing import Optional
from app.database import Database
from app.rag.intent_parser import IntentResult
from app.api.selection import (
    DYNAMIC_SW_MAPPINGS,
    make_sw_expr_query,
    SW_SUPPORTED_VALUES,
    base_hardware_mappings,
)

# 傳給 LLM 做詳細分析的最大型號數（避免 prompt 過長）
TOP_N_FOR_REPORT = 15


def build_mongo_filter(
    intent: IntentResult,
    selected_models: list[str],
) -> dict:
    """
    根據意圖解析結果 + 前端已鎖定的型號，組裝 MongoDB $and 查詢。

    優先順序：
    1. 排除 EOL / Phase Out 型號
    2. 若 selected_models 非空 → 限縮在此清單內（前端已篩過）
    3. 套用 intent.filter 的硬體條件
    4. 套用 intent.software_requirements 的軟體條件
    """
    and_conditions = [
        {"hardware.PLM Lifecycle": {"$nin": ["EOL", "Phase Out"]}}
    ]

    # 前端已鎖定的型號 → 限縮搜尋範圍
    if selected_models:
        and_conditions.append({"product_pn": {"$in": selected_models}})

    f = intent.filter

    # Application 篩選
    if f.application:
        and_conditions.append({"hardware.Application": f.application})

    # 管理類型
    if f.function:
        and_conditions.append({"hardware.Function": f.function})

    # PoE 篩選（複用 base_hardware_mappings）
    if f.has_poe is True:
        and_conditions.append(base_hardware_mappings["has_poe"]())
    elif f.has_poe is False:
        # 明確不需要 PoE → 排除所有有 PoE 的型號
        poe_cond = base_hardware_mappings["has_poe"]()
        and_conditions.append({"$nor": [poe_cond]})

    # 溫度等級
    if f.temp_grade == "Wide":
        and_conditions.append(base_hardware_mappings["temp_wide"]())
    elif f.temp_grade == "Normal":
        and_conditions.append(
            {"hardware.Temp Grade": {"$nin": ["Wide", "wide", "T", "Wide Temp"]}}
        )

    # Port 數量（大於等於）
    if f.port_count_min:
        and_conditions.append({
            "$expr": {
                "$gte": [
                    {"$toInt": {"$ifNull": ["$hardware.Port Numbers", "0"]}},
                    f.port_count_min
                ]
            }
        })

    # 軟體功能條件（複用 make_sw_expr_query）
    for feat_key in intent.software_requirements:
        # 情境 1：如果 LLM 抽取出來的是「大分類 (Category)」 (例如 "IEC 61850")
        # 代表使用者想要該分類下的任一功能，我們用 $or 包起來
        features_in_cat = [
            mapping["feat_key"]
            for mapping in DYNAMIC_SW_MAPPINGS.values()
            if mapping["category"] == feat_key
        ]
        if features_in_cat:
            sw_or = [make_sw_expr_query(feat_key, fk) for fk in features_in_cat]
            and_conditions.append({"$or": sw_or} if len(sw_or) > 1 else sw_or[0])
            continue
            
        # 情境 2：如果 LLM 抽取出來的是「具體功能 (Feature)」 (例如 "GOOSE Subscriber")
        matched_categories = [
            mapping["category"]
            for mapping in DYNAMIC_SW_MAPPINGS.values()
            if mapping["feat_key"] == feat_key
        ]
        if matched_categories:
            # 同一個 feat_key 可能存在於多個 category（用 $or）
            sw_or = [
                make_sw_expr_query(cat, feat_key)
                for cat in matched_categories
            ]
            and_conditions.append({"$or": sw_or} if len(sw_or) > 1 else sw_or[0])

    return {"$and": and_conditions} if len(and_conditions) > 1 else and_conditions[0]


def run_hard_filter(
    intent: IntentResult,
    selected_models: list[str],
) -> tuple[list[dict], list[dict]]:
    """
    執行 MongoDB 查詢，回傳 (all_docs, top_docs)。

    all_docs：所有符合型號的文件（完整列表，供 referenced_models 顯示）
    top_docs：前 TOP_N_FOR_REPORT 筆（傳給 LLM 做詳細分析，避免 prompt 過長）
    """
    db = Database.get_db()
    query = build_mongo_filter(intent, selected_models)

    try:
        all_docs = list(db.product_specs.find(query))
    except Exception as e:
        print(f"[HardFilter] MongoDB 查詢失敗：{e}")
        return [], []

    top_docs = all_docs[:TOP_N_FOR_REPORT]
    return all_docs, top_docs
