import os
import uvicorn
import socketio

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.agent_router import router as agent_router
from app.api.agent_note_router import router as agent_note_router
from app.api.chat_router import router as chat_router
from app.api.market_router import router as market_router
from app.api.social_router import router as social_router
from app.canvas_socket import create_canvas_socket_server
from app.gateway import router as gateway_router

fastapi_app = FastAPI()

default_origins = "http://localhost:3000,http://localhost:5173,http://localhost:5174"
origins = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", default_origins).split(",")
    if origin.strip()
]

fastapi_app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
@fastapi_app.get("/")
async def root():
    return {"message": "Hello, World!"}

# flownote-API가 직접 제공하는 백엔드 라우터(먼저 매칭).
fastapi_app.include_router(agent_router)
fastapi_app.include_router(agent_note_router)
fastapi_app.include_router(chat_router)
fastapi_app.include_router(market_router)
fastapi_app.include_router(social_router)

# 게이트웨이 catch-all: 위 라우터가 처리하지 않는 /api/**를 백엔드로 라우팅한다.
# canvas → flownote-canvas(Go), 그 외 → flownote-server(Spring). 반드시 마지막에 등록한다.
fastapi_app.include_router(gateway_router)

socket_server = create_canvas_socket_server(origins)
app = socketio.ASGIApp(socket_server, fastapi_app)


if __name__ == "__main__":
    uvicorn.run("app.main:app", host=os.getenv("API_HOST", "0.0.0.0"), port=8000, reload=True)
