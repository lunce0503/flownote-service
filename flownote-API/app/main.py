import os
import uvicorn
from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.agent_router import router as agent_router
from app.api.chat_router import router as chat_router

app = FastAPI()
UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", Path.cwd() / "uploads"))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

origins = [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://192.168.0.18:5173",
    "https://width-doozy-avatar.ngrok-free.dev"
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

app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

def sanitize_filename(filename: str) -> str:
    base_name = Path(filename.replace("\\", "/")).name
    return "".join(char if char.isalnum() or char in "._-" else "_" for char in base_name)

@app.post("/api/upload")
async def upload_image(image: UploadFile = File(...)):
    if not image.content_type or not image.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="이미지 파일만 업로드할 수 있습니다.")

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    safe_name = sanitize_filename(image.filename or "image")
    filename = f"{uuid4()}-{safe_name}"
    file_path = UPLOAD_DIR / filename

    with file_path.open("wb") as file:
        while chunk := await image.read(1024 * 1024):
            file.write(chunk)

    return {"filename": filename}

app.include_router(agent_router)
app.include_router(chat_router)


if __name__ == "__main__":
    uvicorn.run("app.main:app", host="192.168.0.18", port=8000, reload=True)
