"""An in-memory FlowNote, so the agent loop is runnable before the real backend
exists. Swap MOCK_EXECUTORS for real handlers when you wire this into the app -
the loop, the schemas and the protocol stay unchanged.
"""

from __future__ import annotations

import hashlib
import re
from datetime import datetime, timedelta, timezone
from typing import Any

KST = timezone(timedelta(hours=9))

_NOTES: dict[str, dict[str, Any]] = {}
_TASKS: dict[str, dict[str, Any]] = {}
_REMINDERS: list[dict[str, Any]] = []


def _new_id(prefix: str, seed: str) -> str:
    return f"{prefix}_{hashlib.sha1(seed.encode()).hexdigest()[:6]}"


def _seed() -> None:
    if _NOTES:
        return
    now = datetime.now(KST)
    fixtures = [
        ("주간 standup 2026-07-29", "- 배포 파이프라인 점검\n- QLoRA 실험 결과 공유\n",
         ["work", "standup"], "work/meetings", 1),
        ("Gemma 4 학습 메모", "E2B는 Per-Layer Embeddings로 실효 2.3B, 원시 5.15B.\n",
         ["ai", "gemma"], "study", 2),
        ("Reading log: The Pragmatic Programmer",
         "DRY, orthogonality, tracer bullets.\n", ["reading"], "personal", 5),
    ]
    for title, body, tags, folder, days_ago in fixtures:
        nid = _new_id("note", title)
        _NOTES[nid] = {
            "note_id": nid, "title": title, "body": body, "tags": tags,
            "folder": folder,
            "updated_at": (now - timedelta(days=days_ago)).isoformat(timespec="seconds"),
        }


def create_note(a: dict[str, Any]) -> Any:
    _seed()
    nid = _new_id("note", a["title"] + a["body"][:20])
    _NOTES[nid] = {
        "note_id": nid, "title": a["title"], "body": a["body"],
        "tags": a.get("tags", []), "folder": a.get("folder", "inbox"),
        "updated_at": datetime.now(KST).isoformat(timespec="seconds"),
    }
    return {"status": "created", "note_id": nid}


def search_notes(a: dict[str, Any]) -> Any:
    _seed()
    terms = [t for t in re.split(r"\s+", a["query"].lower()) if t]
    want_tags = set(a.get("tags") or [])
    hits = []
    for note in _NOTES.values():
        haystack = f"{note['title']} {note['body']} {' '.join(note['tags'])}".lower()
        if terms and not any(t in haystack for t in terms):
            continue
        if want_tags and not want_tags & set(note["tags"]):
            continue
        if (after := a.get("updated_after")) and note["updated_at"] < after:
            continue
        hits.append({
            "note_id": note["note_id"], "title": note["title"],
            "snippet": note["body"][:80].replace("\n", " "),
            "updated_at": note["updated_at"],
        })
    hits.sort(key=lambda h: h["updated_at"], reverse=True)
    return {"count": len(hits), "results": hits[: a.get("limit", 10)]}


def get_note(a: dict[str, Any]) -> Any:
    _seed()
    note = _NOTES.get(a["note_id"])
    return note or {"error": "not_found", "details": f"no note {a['note_id']}"}


def update_note(a: dict[str, Any]) -> Any:
    _seed()
    note = _NOTES.get(a["note_id"])
    if note is None:
        return {"error": "not_found", "details": f"no note {a['note_id']}"}
    if "body" in a:
        mode = a.get("mode", "replace")
        if mode == "append":
            note["body"] = note["body"].rstrip() + "\n" + a["body"]
        elif mode == "prepend":
            note["body"] = a["body"] + "\n" + note["body"]
        else:
            note["body"] = a["body"]
    if "title" in a:
        note["title"] = a["title"]
    if "tags" in a:
        note["tags"] = a["tags"]
    note["updated_at"] = datetime.now(KST).isoformat(timespec="seconds")
    return {"status": "updated", "note_id": note["note_id"], "updated_at": note["updated_at"]}


def delete_note(a: dict[str, Any]) -> Any:
    _seed()
    if not a.get("confirm"):
        return {"error": "confirmation_required",
                "details": "set confirm=true only after the user agrees"}
    note = _NOTES.pop(a["note_id"], None)
    if note is None:
        return {"error": "not_found", "details": a["note_id"]}
    return {"status": "trashed", "note_id": a["note_id"], "restorable_for_days": 30}


def link_notes(a: dict[str, Any]) -> Any:
    _seed()
    missing = [k for k in ("source_id", "target_id") if a[k] not in _NOTES]
    if missing:
        return {"error": "not_found", "details": f"unknown ids: {missing}"}
    return {"status": "linked", "relation": a.get("relation", "related")}


def summarize_note(a: dict[str, Any]) -> Any:
    _seed()
    note = _NOTES.get(a["note_id"])
    if note is None:
        return {"error": "not_found", "details": a["note_id"]}
    lines = [l.strip("- ").strip() for l in note["body"].splitlines() if l.strip()]
    return {"summary": " ".join(lines[: a.get("max_sentences", 3)]),
            "language": a.get("language", "ko")}


def create_task(a: dict[str, Any]) -> Any:
    tid = _new_id("task", a["title"])
    _TASKS[tid] = {"task_id": tid, "title": a["title"], "status": "open",
                   "due_at": a.get("due_at"), "priority": a.get("priority", "normal"),
                   "note_id": a.get("note_id")}
    return {"status": "created", "task_id": tid}


def list_tasks(a: dict[str, Any]) -> Any:
    status = a.get("status", "open")
    out = [t for t in _TASKS.values() if status == "all" or t["status"] == status]
    if before := a.get("due_before"):
        out = [t for t in out if t.get("due_at") and t["due_at"] <= before]
    return {"count": len(out), "tasks": out[: a.get("limit", 20)]}


def set_reminder(a: dict[str, Any]) -> Any:
    _REMINDERS.append(dict(a))
    return {"status": "scheduled", "remind_at": a["remind_at"],
            "reminder_id": _new_id("rem", a["message"])}


def get_current_time(a: dict[str, Any]) -> Any:
    return {"now": datetime.now(KST).isoformat(timespec="seconds"),
            "timezone": a.get("timezone", "Asia/Seoul"),
            "weekday": datetime.now(KST).strftime("%A")}


def web_search(a: dict[str, Any]) -> Any:
    return {"results": [
        {"title": f"[mock] {a['query']} - overview",
         "url": "https://example.com/1", "snippet": "Mock search result."},
    ][: a.get("num_results", 5)]}


def fetch_url(a: dict[str, Any]) -> Any:
    return {"url": a["url"], "markdown": "# Mock page\n\nMock content."}


def export_note(a: dict[str, Any]) -> Any:
    _seed()
    if a["note_id"] not in _NOTES:
        return {"error": "not_found", "details": a["note_id"]}
    return {"download_url": f"https://flownote.local/export/{a['note_id']}.{a['format']}"}


MOCK_EXECUTORS = {
    "create_note": create_note,
    "search_notes": search_notes,
    "get_note": get_note,
    "update_note": update_note,
    "delete_note": delete_note,
    "link_notes": link_notes,
    "summarize_note": summarize_note,
    "create_task": create_task,
    "list_tasks": list_tasks,
    "set_reminder": set_reminder,
    "get_current_time": get_current_time,
    "web_search": web_search,
    "fetch_url": fetch_url,
    "export_note": export_note,
}
