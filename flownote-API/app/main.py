import os
import uvicorn

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.agent_router import router as agent_router
from app.api.chat_router import router as chat_router
from app.api.market_router import router as market_router
from app.api.social_router import router as social_router

app = FastAPI()

default_origins = "http://localhost:3000,http://localhost:5173"
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
    return {"message": "Hello, World!"}

app.include_router(agent_router)
app.include_router(chat_router)
app.include_router(market_router)
app.include_router(social_router)


if __name__ == "__main__":
    uvicorn.run("app.main:app", host=os.getenv("API_HOST", "0.0.0.0"), port=8000, reload=True)
