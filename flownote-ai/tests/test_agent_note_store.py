from pathlib import Path

from app.services.agent_note_store import AgentNoteStore
from app.services.ollama_client import strip_data_uri


def test_store_ranks_cosine_similarity_and_isolates_rooms(tmp_path: Path):
    store = AgentNoteStore(str(tmp_path / "agent-note.db"))
    store.add("room-a", "red circle", [1.0, 0.0], "red.png")
    store.add("room-a", "blue square", [0.0, 1.0], "blue.png")
    store.add("room-b", "private", [1.0, 0.0], "private.png")

    matches = store.search("room-a", [0.9, 0.1], 5)

    assert [match["caption"] for match in matches] == ["red circle", "blue square"]
    assert all(match["image_ref"] != "private.png" for match in matches)
    assert store.count("room-a") == 2
    assert store.count("room-b") == 1


def test_strip_data_uri_keeps_plain_base64_and_removes_prefix():
    assert strip_data_uri("data:image/png;base64,YWJj") == "YWJj"
    assert strip_data_uri("YWJj") == "YWJj"
