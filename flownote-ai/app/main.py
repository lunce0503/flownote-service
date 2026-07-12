import os

import uvicorn

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.agent_router import router as agent_router
from app.api.agent_note_router import router as agent_note_router
from app.api.chat_router import router as chat_router
from app.api.market_router import router as market_router
from app.api.social_router import router as social_router

# flownote-ai: flownote-API에서 분리된 AI/데이터 백엔드 전담 서비스.
# - /api/aiclient   : 메인 에이전트(Gemini) 스트리밍
# - /api/agent-note : 내부망 Ollama 이미지 캡션/검색 (Ollama가 있는 내부망에서만 동작)
# - /api/market     : 주식 시세 (Spring이 STOCK_MARKET_DATA_URL로 소비)
# - /api/chat       : 채팅
# - /api/social     : 소셜
# 클라이언트는 게이트웨이(flownote-API)를 거쳐 이 서비스로 라우팅된다.
app = FastAPI(title="flownote-ai")

default_origins = "http://localhost:3000,http://localhost:5173,http://localhost:5174"
origins = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", default_origins).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return {"status": "UP", "service": "flownote-ai"}


app.include_router(agent_router)
app.include_router(agent_note_router)
app.include_router(chat_router)
app.include_router(market_router)
app.include_router(social_router)


if __name__ == "__main__":
    uvicorn.run("app.main:app", host=os.getenv("API_HOST", "0.0.0.0"), port=int(os.getenv("PORT", "8000")), reload=True)
