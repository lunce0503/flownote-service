"""에이전트 노트 이미지 캡션 인덱스 저장소(flownote-API 전용 테이블).

flownote-API 는 DB 계층이 없어 최종 데이터는 Spring Core API 가 소유한다.
이 인덱스는 그림판 이미지의 '텍스트 캡션 + 임베딩' 만 담는 보조 검색 인덱스로,
새 DB 의존성(asyncpg/sqlmodel) 없이 stdlib sqlite3 로 프로토타입을 유지한다.
(운영 확장 시 pgvector 등으로 이관 가능)

동기 sqlite3 호출은 서비스 계층에서 asyncio.to_thread 로 감싼다(codebase forward_request_async 패턴).
"""

from __future__ import annotations

import json
import math
import os
import sqlite3
import threading
import time
import uuid
from typing import Any


AGENT_NOTE_DB_PATH = os.getenv("AGENT_NOTE_DB_PATH", "/app/data/agent_note.db")


def _cosine(query: list[float], query_norm: float, vector: list[float]) -> float:
    if query_norm == 0.0 or not vector:
        return 0.0
    dot = 0.0
    norm = 0.0
    for q, v in zip(query, vector):
        dot += q * v
        norm += v * v
    norm = math.sqrt(norm)
    if norm == 0.0:
        return 0.0
    return dot / (query_norm * norm)


class AgentNoteStore:
    def __init__(self, db_path: str = AGENT_NOTE_DB_PATH) -> None:
        self._db_path = db_path
        self._lock = threading.Lock()
        self._initialized = False

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _ensure(self) -> None:
        # 지연 초기화: import 시점에 파일시스템을 건드리지 않아, 경로 문제가
        # 앱 전체 import 실패로 번지지 않고 agent-note 요청에서만 드러나게 한다.
        if self._initialized:
            return
        with self._lock:
            if self._initialized:
                return
            parent = os.path.dirname(self._db_path)
            if parent:
                os.makedirs(parent, exist_ok=True)
            self._init_db()
            self._initialized = True

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS agent_note_index (
                    id         TEXT PRIMARY KEY,
                    room_id    TEXT NOT NULL,
                    caption    TEXT NOT NULL,
                    embedding  TEXT NOT NULL,
                    image_ref  TEXT,
                    source     TEXT,
                    created_at REAL NOT NULL
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_agent_note_room ON agent_note_index(room_id)"
            )

    def add(
        self,
        room_id: str,
        caption: str,
        embedding: list[float],
        image_ref: str | None = None,
        source: str | None = None,
    ) -> dict[str, Any]:
        self._ensure()
        entry_id = str(uuid.uuid4())
        created_at = time.time()
        with self._lock, self._connect() as conn:
            conn.execute(
                "INSERT INTO agent_note_index "
                "(id, room_id, caption, embedding, image_ref, source, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                (
                    entry_id,
                    room_id,
                    caption,
                    json.dumps(embedding),
                    image_ref,
                    source,
                    created_at,
                ),
            )
        return {
            "id": entry_id,
            "room_id": room_id,
            "caption": caption,
            "image_ref": image_ref,
            "source": source,
            "created_at": created_at,
        }

    def search(
        self,
        room_id: str,
        query_embedding: list[float],
        k: int = 5,
    ) -> list[dict[str, Any]]:
        self._ensure()
        with self._lock, self._connect() as conn:
            rows = conn.execute(
                "SELECT id, caption, embedding, image_ref, source, created_at "
                "FROM agent_note_index WHERE room_id = ?",
                (room_id,),
            ).fetchall()
        if not rows:
            return []

        query_norm = math.sqrt(sum(q * q for q in query_embedding))
        scored: list[dict[str, Any]] = []
        for row in rows:
            vector = json.loads(row["embedding"])
            score = _cosine(query_embedding, query_norm, vector)
            scored.append(
                {
                    "id": row["id"],
                    "caption": row["caption"],
                    "image_ref": row["image_ref"],
                    "source": row["source"],
                    "created_at": row["created_at"],
                    "score": round(score, 6),
                }
            )
        scored.sort(key=lambda item: item["score"], reverse=True)
        return scored[: max(1, k)]

    def count(self, room_id: str | None = None) -> int:
        self._ensure()
        with self._lock, self._connect() as conn:
            if room_id is None:
                row = conn.execute("SELECT COUNT(*) AS n FROM agent_note_index").fetchone()
            else:
                row = conn.execute(
                    "SELECT COUNT(*) AS n FROM agent_note_index WHERE room_id = ?",
                    (room_id,),
                ).fetchone()
        return int(row["n"]) if row else 0
