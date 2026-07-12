import os
import uvicorn
import socketio

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.canvas_socket import create_canvas_socket_server
from app.gateway import router as gateway_router

# flownote-API는 API 게이트웨이다. 클라이언트 /api/** 요청을 받아 경로에 따라 백엔드로 라우팅한다.
# - /api/canvas/**                       → flownote-canvas(Go)
# - /api/aiclient·agent-note·market·chat·social → flownote-ai
# - 그 외 코어 /api/**                    → flownote-server(Spring)
# 자체 백엔드 로직은 없다(모두 flownote-ai로 분리). 실시간 캔버스 Socket.IO 중계만 직접 담당한다.
fastapi_app = FastAPI(title="flownote-api-gateway")

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
    return {"status": "UP", "service": "flownote-api-gateway"}


# 게이트웨이 라우팅(catch-all). 백엔드별 프록시 규칙은 app/gateway.py 참고.
fastapi_app.include_router(gateway_router)

# 실시간 캔버스 소켓 중계(→ flownote-canvas). 게이트웨이가 HTTP만 다루므로 소켓은 여기서 직접.
socket_server = create_canvas_socket_server(origins)
app = socketio.ASGIApp(socket_server, fastapi_app)


if __name__ == "__main__":
    uvicorn.run("app.main:app", host=os.getenv("API_HOST", "0.0.0.0"), port=int(os.getenv("PORT", "8000")), reload=True)
