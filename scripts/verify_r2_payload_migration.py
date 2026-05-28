#!/usr/bin/env python3
import json
import os
import subprocess
import sys
from urllib.parse import parse_qsl, urlparse


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


def main() -> int:
    summary = json.loads(run_psql("""
        WITH checks AS (
            SELECT
                (SELECT COUNT(*) FROM canvas_elements) AS canvas_elements_total,
                (SELECT COUNT(*) FROM canvas_elements WHERE object_key IS NULL) AS canvas_elements_without_object_key,
                (SELECT COUNT(*) FROM canvas_elements WHERE object_key IS NOT NULL) AS canvas_elements_with_object_key,
                (SELECT COUNT(*) FROM canvas_elements WHERE pg_column_size(payload) > 512) AS canvas_elements_large_db_payloads,
                (SELECT COUNT(*) FROM notes) AS notes_total,
                (SELECT COUNT(*) FROM notes WHERE content_object_key IS NULL) AS notes_without_content_object_key,
                (SELECT COUNT(*) FROM notes WHERE content_object_key IS NOT NULL) AS notes_with_content_object_key,
                (SELECT COUNT(*) FROM notes WHERE pg_column_size(content) > 512) AS notes_large_db_contents,
                (SELECT COUNT(*) FROM chat_messages) AS chat_messages_total,
                (SELECT COUNT(*) FROM chat_messages WHERE message_object_key IS NULL) AS chat_messages_without_object_key,
                (SELECT COUNT(*) FROM chat_messages WHERE message_object_key IS NOT NULL) AS chat_messages_with_object_key,
                (SELECT COUNT(*) FROM chat_messages WHERE pg_column_size(message) > 512) AS chat_messages_large_db_messages,
                (SELECT COUNT(*) FROM social) AS social_messages_total,
                (SELECT COUNT(*) FROM social WHERE message_object_key IS NULL) AS social_messages_without_object_key,
                (SELECT COUNT(*) FROM social WHERE message_object_key IS NOT NULL) AS social_messages_with_object_key,
                (SELECT COUNT(*) FROM social WHERE pg_column_size(message) > 512) AS social_messages_large_db_messages,
                (SELECT COUNT(*) FROM tasks) AS tasks_total,
                (SELECT COUNT(*) FROM tasks WHERE memo_object_key IS NULL AND COALESCE(memo, '') <> '') AS tasks_without_memo_object_key,
                (SELECT COUNT(*) FROM tasks WHERE links_object_key IS NULL AND COALESCE(array_length(links, 1), 0) > 0) AS tasks_without_links_object_key,
                (SELECT COUNT(*) FROM tasks WHERE time_logs_object_key IS NULL AND jsonb_array_length(time_logs) > 0) AS tasks_without_time_logs_object_key,
                (SELECT COUNT(*) FROM tasks WHERE pg_column_size(memo) > 512) AS tasks_large_db_memos,
                (SELECT COUNT(*) FROM tasks WHERE pg_column_size(links) > 512) AS tasks_large_db_links,
                (SELECT COUNT(*) FROM tasks WHERE pg_column_size(time_logs) > 512) AS tasks_large_db_time_logs,
                (SELECT COUNT(*) FROM daily_schedule_items) AS schedule_items_total,
                (SELECT COUNT(*) FROM daily_schedule_items WHERE memo_object_key IS NULL AND COALESCE(memo, '') <> '') AS schedule_items_without_memo_object_key,
                (SELECT COUNT(*) FROM daily_schedule_items WHERE pg_column_size(memo) > 512) AS schedule_items_large_db_memos,
                (SELECT COUNT(*) FROM canvas_assets) AS canvas_assets_total,
                (SELECT COUNT(*) FROM canvas_assets WHERE object_key IS NULL OR object_key = '') AS canvas_assets_without_object_key
        )
        SELECT row_to_json(checks)::text FROM checks;
    """))
    print(json.dumps(summary, ensure_ascii=False, indent=2))

    failures = []
    if summary["canvas_elements_without_object_key"] != 0:
        failures.append("canvas_elements_without_object_key")
    if summary["notes_without_content_object_key"] != 0:
        failures.append("notes_without_content_object_key")
    if summary["canvas_elements_large_db_payloads"] != 0:
        failures.append("canvas_elements_large_db_payloads")
    if summary["notes_large_db_contents"] != 0:
        failures.append("notes_large_db_contents")
    if summary["chat_messages_without_object_key"] != 0:
        failures.append("chat_messages_without_object_key")
    if summary["chat_messages_large_db_messages"] != 0:
        failures.append("chat_messages_large_db_messages")
    if summary["social_messages_without_object_key"] != 0:
        failures.append("social_messages_without_object_key")
    if summary["social_messages_large_db_messages"] != 0:
        failures.append("social_messages_large_db_messages")
    if summary["tasks_without_memo_object_key"] != 0:
        failures.append("tasks_without_memo_object_key")
    if summary["tasks_without_links_object_key"] != 0:
        failures.append("tasks_without_links_object_key")
    if summary["tasks_without_time_logs_object_key"] != 0:
        failures.append("tasks_without_time_logs_object_key")
    if summary["tasks_large_db_memos"] != 0:
        failures.append("tasks_large_db_memos")
    if summary["tasks_large_db_links"] != 0:
        failures.append("tasks_large_db_links")
    if summary["tasks_large_db_time_logs"] != 0:
        failures.append("tasks_large_db_time_logs")
    if summary["schedule_items_without_memo_object_key"] != 0:
        failures.append("schedule_items_without_memo_object_key")
    if summary["schedule_items_large_db_memos"] != 0:
        failures.append("schedule_items_large_db_memos")
    if summary["canvas_assets_without_object_key"] != 0:
        failures.append("canvas_assets_without_object_key")

    if failures:
        print("R2 payload migration is incomplete: " + ", ".join(failures), file=sys.stderr)
        return 1
    print("R2 payload migration verification passed")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"verification failed: {exc}", file=sys.stderr)
        raise SystemExit(1)
