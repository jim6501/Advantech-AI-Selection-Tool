"""
Phase 3: 語意搜尋測試腳本
測試「輸入自然語言 → 轉向量 → MongoDB $vectorSearch → 回傳最相關文本」流程
"""
import os
import sys
from dotenv import load_dotenv
from pymongo import MongoClient
from google import genai
from google.genai import types

# Fix Windows terminal encoding
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

# 載入設定
load_dotenv(dotenv_path="configs/.env")
client = MongoClient(os.getenv("MONGO_URI"))
# db = client[os.getenv("MONGO_DB_NAME", "advantech_ind_sw_tool")]
db = client["Advantech_AI_Selector"]
collection = db["Product_Chunks"]
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL")

ai_client = genai.Client(api_key=os.getenv("GOOGLE_API_KEY"))


def semantic_search(query: str, top_k: int = 3, filter_product: str = None):
    """
    輸入自然語言查詢 → 向量化 → MongoDB $vectorSearch → 回傳 top_k 筆結果
    
    Args:
        query:          使用者的自然語言問題
        top_k:          回傳幾筆最相關結果
        filter_product: (可選) 限定只在某個型號的 Chunks 中搜尋
    """
    print(f"\n[查詢] {query}")
    if filter_product:
        print(f"   -> 篩選範圍: 型號包含 [{filter_product}]")

    # Step 1: 將查詢文字轉為向量
    response = ai_client.models.embed_content(
        model=EMBEDDING_MODEL,
        contents=query,
        config=types.EmbedContentConfig(task_type="RETRIEVAL_QUERY")  # 查詢用 QUERY，匯入用 DOCUMENT
    )
    query_vector = response.embeddings[0].values

    # Step 2: 組合 MongoDB $vectorSearch 聚合管線
    vector_search_stage = {
        "$vectorSearch": {
            "index": "vector_index",
            "path": "embedding",
            "queryVector": query_vector,
            "numCandidates": 50,
            "limit": top_k,
        }
    }

    # 如果有指定型號，加入 filter 限制範圍
    if filter_product:
        vector_search_stage["$vectorSearch"]["filter"] = {
            "product_pn": {"$regex": filter_product}
        }

    # Step 3: 執行查詢，只回傳需要的欄位，加入相似度分數
    pipeline = [
        vector_search_stage,
        {
            "$project": {
                "_id": 0,
                "model_name": 1,
                "chunk_id": 1,
                "content": 1,
                "score": {"$meta": "vectorSearchScore"}
            }
        }
    ]

    results = list(collection.aggregate(pipeline))

    # Step 4: 輸出結果
    if not results:
        print("⚠️  未找到相關結果")
        return

    print(f"\n{'='*60}")
    print(f"  找到 {len(results)} 筆相關結果：")
    print(f"{'='*60}")
    for i, doc in enumerate(results):
        print(f"\n[Result {i+1}] Model: {doc.get('model_name','N/A')} | Chunk: {doc.get('chunk_id','N/A')}")
        print(f"   Score: {doc.get('score', 0):.4f}")
        print(f"   Content: {doc.get('content','')[:200]}...")
        print(f"   {'-'*55}")

    return results


if __name__ == "__main__":
    print("=" * 60)
    print("  MongoDB Atlas Vector Search 語意搜尋測試")
    print("=" * 60)

    # 測試 1: 模糊情境搜尋（最核心的 RAG 場景）
    semantic_search("industrial switch suitable for harsh environments with wide temperature range and can be used on the train")

    # 測試 2: 規格精準搜尋
    semantic_search("12 port managed switch")

    # 測試 3: 認證查詢
    semantic_search("FCC EMC  safety compliance")
