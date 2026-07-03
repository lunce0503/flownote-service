import asyncio
import unittest
import uuid

from fastapi import HTTPException

from app.canvas_socket import (
    CanvasLoadTaskRegistry,
    _combine_canvas_load_results,
    _normalize_mutation_id,
    _require_room_membership,
)


class CanvasMutationIdTest(unittest.TestCase):
    def test_missing_mutation_id_generates_uuid(self) -> None:
        generated = _normalize_mutation_id(None)

        self.assertEqual(str(uuid.UUID(generated)), generated)

    def test_valid_mutation_id_is_preserved(self) -> None:
        mutation_id = str(uuid.uuid4())

        self.assertEqual(mutation_id, _normalize_mutation_id(mutation_id))

    def test_invalid_mutation_id_is_rejected(self) -> None:
        with self.assertRaises(HTTPException) as raised:
            _normalize_mutation_id("not-a-uuid")

        self.assertEqual(400, raised.exception.status_code)


class CanvasRoomMembershipTest(unittest.TestCase):
    def test_member_of_canvas_room_is_allowed(self) -> None:
        _require_room_membership(["some-sid", "canvas:abc"], "abc")

    def test_non_member_is_rejected_with_403(self) -> None:
        with self.assertRaises(HTTPException) as raised:
            _require_room_membership(["some-sid", "canvas:other"], "abc")

        self.assertEqual(403, raised.exception.status_code)

    def test_no_rooms_is_rejected(self) -> None:
        with self.assertRaises(HTTPException) as raised:
            _require_room_membership(None, "abc")

        self.assertEqual(403, raised.exception.status_code)


class CanvasLoadTaskRegistryTest(unittest.IsolatedAsyncioTestCase):
    async def test_cancel_stops_registered_load_task(self) -> None:
        registry = CanvasLoadTaskRegistry()
        started = asyncio.Event()

        async def wait_forever() -> None:
            started.set()
            await asyncio.Event().wait()

        task = asyncio.create_task(wait_forever())
        registry.register("sid-1", "request-1", task)
        await started.wait()

        self.assertTrue(registry.cancel("sid-1", "request-1"))
        with self.assertRaises(asyncio.CancelledError):
            await task

    async def test_cancel_all_only_affects_matching_socket(self) -> None:
        registry = CanvasLoadTaskRegistry()
        first = asyncio.create_task(asyncio.sleep(60))
        second = asyncio.create_task(asyncio.sleep(60))
        registry.register("sid-1", "request-1", first)
        registry.register("sid-2", "request-2", second)

        registry.cancel_all("sid-1")
        await asyncio.sleep(0)

        self.assertTrue(first.cancelled())
        self.assertFalse(second.cancelled())
        second.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await second


class CanvasPartialLoadTest(unittest.TestCase):
    def test_elements_are_returned_when_metadata_fails(self) -> None:
        data, warnings = _combine_canvas_load_results(
            RuntimeError("metadata unavailable"),
            {"lines": [{"id": "line-1"}], "images": [], "textBoxes": [], "revision": 7},
        )

        self.assertEqual([{"id": "line-1"}], data["lines"])
        self.assertEqual(7, data["revision"])
        self.assertEqual(1, len(warnings))

    def test_elements_failure_still_fails_the_load(self) -> None:
        with self.assertRaises(RuntimeError):
            _combine_canvas_load_results({"title": "canvas"}, RuntimeError("elements unavailable"))

    def test_metadata_cancellation_is_treated_as_partial_metadata_failure(self) -> None:
        data, warnings = _combine_canvas_load_results(
            asyncio.CancelledError(),
            {"lines": [{"id": "line-1"}], "images": [], "textBoxes": [], "revision": 8},
        )

        self.assertEqual([{"id": "line-1"}], data["lines"])
        self.assertEqual(8, data["revision"])
        self.assertEqual(1, len(warnings))

    def test_elements_cancellation_still_cancels_the_load(self) -> None:
        with self.assertRaises(asyncio.CancelledError):
            _combine_canvas_load_results({"title": "canvas"}, asyncio.CancelledError())


if __name__ == "__main__":
    unittest.main()
