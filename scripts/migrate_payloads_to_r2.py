#!/usr/bin/env python3
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import json
import os
import subprocess
import sys
import uuid
from urllib.parse import parse_qsl, urlparse

import boto3
from botocore.config import Config


def require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"{name} is required")
    return value


def run_psql(sql: str) -> str:
    database_url = urlparse(require_env("DATABASE_PUBLIC_URL"))
    query_args = []
    for key, value in parse_qsl(database_url.query, keep_blank_values=True):
        query_args.extend(["-c", f"{key}={value}"])
    env = os.environ.copy()
    if database_url.password:
        env["PGPASSWORD"] = database_url.password
    completed = subprocess.run(
        [
            "psql",
            "-h",
            database_url.hostname or "",
            "-p",
            str(database_url.port or 5432),
            "-U",
            database_url.username or "",
            "-d",
            database_url.path.lstrip("/") or "railway",
            *query_args,
            "-X",
            "-q",
            "-tA",
            "-v",
            "ON_ERROR_STOP=1",
        ],
        input=sql,
        text=True,
        capture_output=True,
        env=env,
    )
    if completed.returncode != 0:
        raise RuntimeError(completed.stderr.strip() or "psql command failed")
    return completed.stdout.strip()


def sql_string(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def jsonb_literal(value: object) -> str:
    return "$json$" + json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "$json$::jsonb"


def bounds_for(element_type: str, payload: dict) -> tuple[float, float, float, float]:
    if element_type == "line":
        points = payload.get("points") or []
        if points:
            xs = [float(point.get("x", 0)) for point in points]
            ys = [float(point.get("y", 0)) for point in points]
            return min(xs), min(ys), max(xs), max(ys)
    x = float(payload.get("x", 0))
    y = float(payload.get("y", 0))
    width = max(0.0, float(payload.get("width", 0)))
    height = max(0.0, float(payload.get("height", 0)))
    return x, y, x + width, y + height


def put_json(client, bucket: str, object_key: str, payload: object) -> int:
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return put_bytes(client, bucket, object_key, body, "application/json")


def put_bytes(client, bucket: str, object_key: str, body: bytes, content_type: str) -> int:
    client.put_object(
        Bucket=bucket,
        Key=object_key,
        Body=body,
        ContentType=content_type,
        ContentLength=len(body),
    )
    return len(body)


def put_json_payloads(client, bucket: str, uploads: list[tuple[str, object]], dry_run: bool) -> dict[str, int]:
    bodies = {
        object_key: json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        for object_key, payload in uploads
    }
    if dry_run or not bodies:
        return {object_key: len(body) if not dry_run else 0 for object_key, body in bodies.items()}
    byte_sizes: dict[str, int] = {}
    with ThreadPoolExecutor(max_workers=min(24, len(bodies))) as executor:
        futures = {
            executor.submit(put_bytes, client, bucket, object_key, body, "application/json"): object_key
            for object_key, body in bodies.items()
        }
        for future in as_completed(futures):
            object_key = futures[future]
            byte_sizes[object_key] = future.result()
    return byte_sizes


def put_text(client, bucket: str, object_key: str, text: str) -> int:
    body = (text or "").encode("utf-8")
    client.put_object(
        Bucket=bucket,
        Key=object_key,
        Body=body,
        ContentType="text/plain; charset=utf-8",
        ContentLength=len(body),
    )
    return len(body)


def check_r2(client, bucket: str) -> None:
    key = f"healthcheck/{uuid.uuid4().hex}.txt"
    body = b"ok"
    client.put_object(Bucket=bucket, Key=key, Body=body, ContentType="text/plain")
    try:
        actual = client.get_object(Bucket=bucket, Key=key)["Body"].read()
        if actual != body:
            raise RuntimeError("R2 read/write check returned unexpected content")
    finally:
        client.delete_object(Bucket=bucket, Key=key)


def load_canvas_rows(limit: int) -> list[dict]:
    return json.loads(run_psql(f"""
        SELECT COALESCE(jsonb_agg(row_data), '[]'::jsonb)::text
        FROM (
            SELECT jsonb_build_object(
                'id', id,
                'canvas_id', canvas_id,
                'user_id', user_id,
                'type', type,
                'payload', payload
            ) AS row_data
            FROM canvas_elements
            WHERE object_key IS NULL
            ORDER BY updated_at ASC, created_at ASC
            LIMIT {limit}
        ) rows;
    """) or "[]")


def load_note_rows(limit: int) -> list[dict]:
    return json.loads(run_psql(f"""
        SELECT COALESCE(jsonb_agg(row_data), '[]'::jsonb)::text
        FROM (
            SELECT jsonb_build_object(
                'id', id,
                'user_id', user_id,
                'content', content
            ) AS row_data
            FROM notes
            WHERE content_object_key IS NULL
            ORDER BY updated_at ASC, created_at ASC
            LIMIT {limit}
        ) rows;
    """) or "[]")


def load_chat_rows(limit: int) -> list[dict]:
    return json.loads(run_psql(f"""
        SELECT COALESCE(jsonb_agg(row_data), '[]'::jsonb)::text
        FROM (
            SELECT jsonb_build_object(
                'id', id,
                'user_id', user_id,
                'message', message
            ) AS row_data
            FROM chat_messages
            WHERE message_object_key IS NULL
            ORDER BY timestamp ASC
            LIMIT {limit}
        ) rows;
    """) or "[]")


def load_social_rows(limit: int) -> list[dict]:
    return json.loads(run_psql(f"""
        SELECT COALESCE(jsonb_agg(row_data), '[]'::jsonb)::text
        FROM (
            SELECT jsonb_build_object(
                'id', id,
                'room_id', room_id,
                'user_id', user_id,
                'message', message
            ) AS row_data
            FROM social
            WHERE message_object_key IS NULL
            ORDER BY timestamp ASC
            LIMIT {limit}
        ) rows;
    """) or "[]")


def load_task_rows(limit: int) -> list[dict]:
    return json.loads(run_psql(f"""
        SELECT COALESCE(jsonb_agg(row_data), '[]'::jsonb)::text
        FROM (
            SELECT jsonb_build_object(
                'id', id,
                'user_id', user_id,
                'memo', memo,
                'links', links,
                'time_logs', time_logs
            ) AS row_data
            FROM tasks
            WHERE (memo_object_key IS NULL AND COALESCE(memo, '') <> '')
               OR (links_object_key IS NULL AND COALESCE(array_length(links, 1), 0) > 0)
               OR (time_logs_object_key IS NULL AND jsonb_array_length(time_logs) > 0)
            ORDER BY updated_at ASC, created_at ASC
            LIMIT {limit}
        ) rows;
    """) or "[]")


def load_schedule_rows(limit: int) -> list[dict]:
    return json.loads(run_psql(f"""
        SELECT COALESCE(jsonb_agg(row_data), '[]'::jsonb)::text
        FROM (
            SELECT jsonb_build_object(
                'id', id,
                'user_id', user_id,
                'memo', memo
            ) AS row_data
            FROM daily_schedule_items
            WHERE memo_object_key IS NULL AND COALESCE(memo, '') <> ''
            ORDER BY updated_at ASC, created_at ASC
            LIMIT {limit}
        ) rows;
    """) or "[]")


def pending_counts() -> dict:
    return json.loads(run_psql("""
        SELECT json_build_object(
            'canvas_elements_pending', (SELECT COUNT(*) FROM canvas_elements WHERE object_key IS NULL),
            'notes_pending', (SELECT COUNT(*) FROM notes WHERE content_object_key IS NULL),
            'chat_messages_pending', (SELECT COUNT(*) FROM chat_messages WHERE message_object_key IS NULL),
            'social_messages_pending', (SELECT COUNT(*) FROM social WHERE message_object_key IS NULL),
            'task_memos_pending', (SELECT COUNT(*) FROM tasks WHERE memo_object_key IS NULL AND COALESCE(memo, '') <> ''),
            'task_links_pending', (SELECT COUNT(*) FROM tasks WHERE links_object_key IS NULL AND COALESCE(array_length(links, 1), 0) > 0),
            'task_time_logs_pending', (SELECT COUNT(*) FROM tasks WHERE time_logs_object_key IS NULL AND jsonb_array_length(time_logs) > 0),
            'schedule_memos_pending', (SELECT COUNT(*) FROM daily_schedule_items WHERE memo_object_key IS NULL AND COALESCE(memo, '') <> '')
        )::text;
    """))


def migrate_batch(client, bucket: str, public_base_url: str, limit: int, dry_run: bool) -> dict:
    canvas_rows = load_canvas_rows(limit)
    note_rows = load_note_rows(limit)
    chat_rows = load_chat_rows(limit)
    social_rows = load_social_rows(limit)
    task_rows = load_task_rows(limit)
    schedule_rows = load_schedule_rows(limit)
    statements = ["BEGIN;"]
    migrated_canvas = 0
    migrated_notes = 0
    migrated_chat = 0
    migrated_social = 0
    migrated_task_memos = 0
    migrated_task_links = 0
    migrated_task_time_logs = 0
    migrated_schedule_memos = 0

    canvas_uploads = []
    for row in canvas_rows:
        payload = row["payload"]
        if not isinstance(payload, dict) or not payload.get("id"):
            continue
        object_key = f"canvas-elements/{row['canvas_id']}/{row['type']}/{row['id']}.json"
        canvas_uploads.append((object_key, payload))

    canvas_byte_sizes = put_json_payloads(client, bucket, canvas_uploads, dry_run)
    canvas_updates = []
    for row in canvas_rows:
        payload = row["payload"]
        if not isinstance(payload, dict) or not payload.get("id"):
            continue
        object_key = f"canvas-elements/{row['canvas_id']}/{row['type']}/{row['id']}.json"
        public_url = f"{public_base_url}/{object_key}"
        byte_size = canvas_byte_sizes[object_key]
        min_x, min_y, max_x, max_y = bounds_for(row["type"], payload)
        metadata = {
            "id": payload["id"],
            "objectKey": object_key,
            "url": public_url,
        }
        canvas_updates.append(
            "("
            f"{sql_string(row['canvas_id'])}::uuid, "
            f"{sql_string(row['id'])}, "
            f"{jsonb_literal(metadata)}, "
            f"{sql_string(object_key)}, "
            f"{byte_size}, "
            f"{sql_string(public_url)}, "
            f"{min_x}, {min_y}, {max_x}, {max_y}"
            ")"
        )
        migrated_canvas += 1
    if canvas_updates:
        statements.append(
            "UPDATE canvas_elements AS canvas_element SET "
            "payload = migration.payload, "
            "object_key = migration.object_key, "
            "byte_size = migration.byte_size, "
            "public_url = migration.public_url, "
            "bbox_min_x = migration.bbox_min_x, "
            "bbox_min_y = migration.bbox_min_y, "
            "bbox_max_x = migration.bbox_max_x, "
            "bbox_max_y = migration.bbox_max_y, "
            "revision = canvas_element.revision + 1, "
            "updated_at = NOW() "
            "FROM (VALUES "
            + ",\n".join(canvas_updates)
            + ") AS migration(canvas_id, id, payload, object_key, byte_size, public_url, bbox_min_x, bbox_min_y, bbox_max_x, bbox_max_y) "
            "WHERE canvas_element.canvas_id = migration.canvas_id "
            "AND canvas_element.id = migration.id "
            "AND canvas_element.object_key IS NULL;"
        )

    for row in note_rows:
        object_key = f"note-content/{row['user_id']}/{row['id']}.json"
        public_url = f"{public_base_url}/{object_key}"
        byte_size = 0 if dry_run else put_json(client, bucket, object_key, row["content"])
        statements.append(
            "UPDATE notes SET "
            "content = '[]'::jsonb, "
            f"content_object_key = {sql_string(object_key)}, "
            f"content_byte_size = {byte_size}, "
            f"content_public_url = {sql_string(public_url)}, "
            "updated_at = NOW() "
            f"WHERE id = {sql_string(row['id'])}::uuid AND user_id = {sql_string(row['user_id'])}::uuid AND content_object_key IS NULL;"
        )
        migrated_notes += 1

    for row in chat_rows:
        object_key = f"chat-messages/{row['user_id']}/{row['id']}.txt"
        message = row.get("message") or ""
        byte_size = 0 if dry_run else put_text(client, bucket, object_key, message)
        public_url = f"{public_base_url}/{object_key}"
        statements.append(
            "UPDATE chat_messages SET "
            "message = '', "
            f"message_object_key = {sql_string(object_key)}, "
            f"message_byte_size = {byte_size}, "
            f"message_public_url = {sql_string(public_url)} "
            f"WHERE id = {sql_string(row['id'])}::uuid AND user_id = {sql_string(row['user_id'])}::uuid AND message_object_key IS NULL;"
        )
        migrated_chat += 1

    for row in social_rows:
        object_key = f"social-messages/{row['room_id']}/{row['user_id']}/{row['id']}.txt"
        message = row.get("message") or ""
        byte_size = 0 if dry_run else put_text(client, bucket, object_key, message)
        public_url = f"{public_base_url}/{object_key}"
        statements.append(
            "UPDATE social SET "
            "message = '', "
            f"message_object_key = {sql_string(object_key)}, "
            f"message_byte_size = {byte_size}, "
            f"message_public_url = {sql_string(public_url)} "
            f"WHERE id = {sql_string(row['id'])}::uuid AND room_id = {sql_string(row['room_id'])}::uuid AND user_id = {sql_string(row['user_id'])}::uuid AND message_object_key IS NULL;"
        )
        migrated_social += 1

    for row in task_rows:
        updates = []
        task_id = row["id"]
        user_id = row["user_id"]
        if row.get("memo"):
            object_key = f"task-payloads/{user_id}/{task_id}/memo.txt"
            byte_size = 0 if dry_run else put_text(client, bucket, object_key, row["memo"])
            public_url = f"{public_base_url}/{object_key}"
            updates.extend([
                "memo = ''",
                f"memo_object_key = {sql_string(object_key)}",
                f"memo_byte_size = {byte_size}",
                f"memo_public_url = {sql_string(public_url)}",
            ])
            migrated_task_memos += 1
        links = row.get("links") or []
        if links:
            object_key = f"task-payloads/{user_id}/{task_id}/links.json"
            byte_size = 0 if dry_run else put_json(client, bucket, object_key, links)
            public_url = f"{public_base_url}/{object_key}"
            updates.extend([
                "links = ARRAY[]::TEXT[]",
                f"links_object_key = {sql_string(object_key)}",
                f"links_byte_size = {byte_size}",
                f"links_public_url = {sql_string(public_url)}",
            ])
            migrated_task_links += 1
        time_logs = row.get("time_logs") or []
        if time_logs:
            object_key = f"task-payloads/{user_id}/{task_id}/time-logs.json"
            byte_size = 0 if dry_run else put_json(client, bucket, object_key, time_logs)
            public_url = f"{public_base_url}/{object_key}"
            updates.extend([
                "time_logs = '[]'::jsonb",
                f"time_logs_object_key = {sql_string(object_key)}",
                f"time_logs_byte_size = {byte_size}",
                f"time_logs_public_url = {sql_string(public_url)}",
            ])
            migrated_task_time_logs += 1
        if updates:
            statements.append(
                "UPDATE tasks SET "
                + ", ".join(updates)
                + ", updated_at = NOW() "
                + f"WHERE id = {sql_string(task_id)} AND user_id = {sql_string(user_id)}::uuid;"
            )

    for row in schedule_rows:
        object_key = f"schedule-payloads/{row['user_id']}/{row['id']}/memo.txt"
        byte_size = 0 if dry_run else put_text(client, bucket, object_key, row.get("memo") or "")
        public_url = f"{public_base_url}/{object_key}"
        statements.append(
            "UPDATE daily_schedule_items SET "
            "memo = '', "
            f"memo_object_key = {sql_string(object_key)}, "
            f"memo_byte_size = {byte_size}, "
            f"memo_public_url = {sql_string(public_url)}, "
            "updated_at = NOW() "
            f"WHERE id = {sql_string(row['id'])}::uuid AND user_id = {sql_string(row['user_id'])}::uuid AND memo_object_key IS NULL;"
        )
        migrated_schedule_memos += 1

    statements.append("ROLLBACK;" if dry_run else "COMMIT;")
    if any([migrated_canvas, migrated_notes, migrated_chat, migrated_social, migrated_task_memos, migrated_task_links, migrated_task_time_logs, migrated_schedule_memos]):
        run_psql("\n".join(statements))
    return {
        "migrated_canvas_elements": migrated_canvas,
        "migrated_notes": migrated_notes,
        "migrated_chat_messages": migrated_chat,
        "migrated_social_messages": migrated_social,
        "migrated_task_memos": migrated_task_memos,
        "migrated_task_links": migrated_task_links,
        "migrated_task_time_logs": migrated_task_time_logs,
        "migrated_schedule_memos": migrated_schedule_memos,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Move large Flownote JSON payloads from Postgres to R2.")
    parser.add_argument("--limit", type=int, default=500, help="Maximum rows per table to migrate in one batch.")
    parser.add_argument("--dry-run", action="store_true", help="Build the migration batch without writing R2 objects or committing DB updates.")
    parser.add_argument("--skip-r2-check", action="store_true", help="Skip the R2 put/get/delete smoke test.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.limit <= 0:
        raise RuntimeError("--limit must be greater than zero")

    bucket = require_env("FLOWNOTE_STORAGE_BUCKET")
    public_base_url = require_env("FLOWNOTE_STORAGE_PUBLIC_BASE_URL").rstrip("/")
    client = boto3.client(
        "s3",
        endpoint_url=require_env("FLOWNOTE_STORAGE_ENDPOINT"),
        region_name=os.environ.get("FLOWNOTE_STORAGE_REGION") or "auto",
        aws_access_key_id=require_env("FLOWNOTE_STORAGE_ACCESS_KEY_ID"),
        aws_secret_access_key=require_env("FLOWNOTE_STORAGE_SECRET_ACCESS_KEY"),
        config=Config(s3={"addressing_style": "path"}, signature_version="s3v4"),
    )

    before = pending_counts()
    if not args.dry_run and not args.skip_r2_check:
        check_r2(client, bucket)
    batch = migrate_batch(client, bucket, public_base_url, args.limit, args.dry_run)
    after = before if args.dry_run else pending_counts()
    print(json.dumps({
        "dry_run": args.dry_run,
        "limit": args.limit,
        "before": before,
        "batch": batch,
        "after": after,
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"migration failed: {exc}", file=sys.stderr)
        raise SystemExit(1)
