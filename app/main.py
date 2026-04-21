from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pymongo.errors import PyMongoError

from app.database import Database
from app.api import selection


@asynccontextmanager
async def lifespan(app: FastAPI):
    """App 生命週期管理：啟動時連線 MongoDB，關閉時釋放資源"""
    print("[START] FastAPI App Starting...")
    Database.connect_db()
    yield
    print("[STOP] FastAPI App Shutting Down...")
    Database.close_db()


app = FastAPI(
    title="Advantech AI Selection Tool API",
    description="工業交換機智能選型 API，支援硬體/軟體條件篩選與 RAG Chatbot 查詢",
    version="1.0.0",
    lifespan=lifespan,
)

# =========================================================================
# CORS 跨域設定
# 允許前端（file:// 或其他網域）呼叫此 API。
# 正式部署時請將 allow_origins=["*"] 改為明確網域清單。
# =========================================================================
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 實際部署時請改為特定網域
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =========================================================================
# 全域錯誤處理：統一攔截 MongoDB 相關錯誤，避免 500 直接洩漏堆疊資訊
# =========================================================================
@app.exception_handler(PyMongoError)
async def pymongo_exception_handler(request: Request, exc: PyMongoError):
    return JSONResponse(
        status_code=503,
        content={"detail": f"Database error: {str(exc)}"},
    )


# =========================================================================
# 掛載 API 路由
# =========================================================================
app.include_router(selection.router, prefix="/api", tags=["Selection"])


@app.get("/")
def root():
    # 當使用者存取後台根目錄時，直接回傳前端 HTML 介面
    return FileResponse("frontend/select_ui_with_options_claude.html")

# 掛載整個 frontend 資料夾作為靜態檔案，允許存取 /frontend/xxx.html (例如開啟其他分頁)
app.mount("/frontend", StaticFiles(directory="frontend"), name="frontend")
