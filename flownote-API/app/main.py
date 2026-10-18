import os
import logging
import uvicorn
import socketio

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.canvas_socket import create_canvas_socket_server
from app.canvas_http import create_canvas_http_router
from app.sync_socket import register_sync_namespace
from app.gateway import router as gateway_router

# flownote-API는 API 게이트웨이다. 클라이언트 /api/** 요청을 받아 경로에 따라 백엔드로 라우팅한다.
# - /api/canvas/**                       → flownote-canvas(Go)
# - /api/aiclient·market                    → flownote-ai (가동 시)
# - /api/agent-note·capabilities            → 게이트웨이 호환 응답
# - 그 외 코어 /api/**                    → flownote-server(Spring)
# 도메인 저장은 백엔드로 전달하고 캔버스/사용자 변경 알림을 직접 중계한다.
fastapi_app = FastAPI(title="flownote-api-gateway")
logging.basicConfig(level=logging.INFO)

default_origins = ""
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
# 자체 HTTP 저장 진입점을 catch-all보다 먼저 등록한다.
socket_server = create_canvas_socket_server(origins)
register_sync_namespace(socket_server)
fastapi_app.include_router(create_canvas_http_router(socket_server))
fastapi_app.include_router(gateway_router)
app = socketio.ASGIApp(socket_server, fastapi_app)


if __name__ == "__main__":
    uvicorn.run("app.main:app", host=os.getenv("API_HOST", "0.0.0.0"), port=int(os.getenv("PORT", "8000")), reload=True)
