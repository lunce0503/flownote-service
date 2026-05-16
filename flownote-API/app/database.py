import os
from dotenv import load_dotenv

from typing import AsyncGenerator
from contextlib import asynccontextmanager, contextmanager

from sqlalchemy import create_engine, Column, String
from sqlalchemy.orm import Session, sessionmaker, declarative_base
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

load_dotenv()

ASYNC_DATABASE_URL = os.getenv("ASYNC_DATABASE_URL", "")
SYNC_DATABASE_URL = os.getenv("DATABASE_URL", "")

# 디버깅용: URL이 제대로 로드되었는지 확인 (비밀번호 노출 주의)
if not SYNC_DATABASE_URL:
    raise ValueError(".env 파일에서 DATABASE_URL을 찾을 수 없습니다!")


# 동기 엔진
sync_engine = create_engine(SYNC_DATABASE_URL, echo=True, future=True)

sync_session_maker = sessionmaker(
    sync_engine,
    class_=Session,
    expire_on_commit=False
)

# 비동기 엔진
async_engine = create_async_engine(ASYNC_DATABASE_URL,echo=True)

# 비동기 세션 팩토리
async_session_maker = async_sessionmaker(
    async_engine,
    class_=AsyncSession,
    expire_on_commit=False
)

Base = declarative_base()

# 비동기 DB 초기화
async def init_async_db() -> None:
    async with async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        
@asynccontextmanager
async def get_async_session() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_maker() as session:
        try:
            yield session
            await session.commit() 
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()