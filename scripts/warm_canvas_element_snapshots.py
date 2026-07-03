#!/usr/bin/env python3
import argparse
from concurrent.futures import ThreadPoolExecutor
import json
import os
import subprocess
import sys
from urllib.parse import parse_qsl, urlparse

import boto3
from botocore.config import Config


def require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"{name} is required")
    return value


def psql_command() -> tuple[list[str], dict[str, str]]:
    database_url = urlparse(require_env("DATABASE_PUBLIC_URL"))
    query_args = []
    for key, value in parse_qsl(database_url.query, keep_blank_values=True):
        query_args.extend(["-c", f"{key}={value}"])
    env = os.environ.copy()
    if database_url.password:
        env["PGPASSWORD"] = database_url.password
    return [
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
    ], env


def run_psql(sql: str) -> str:
    command, env = psql_command()
    completed = subprocess.run(command, input=sql, text=True, capture_output=True, env=env)
    if completed.returncode != 0:
        raise RuntimeError(completed.stderr.strip() or "psql command failed")
    return completed.stdout.strip()


def sql_string(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def s3_client():
    return boto3.client(
        "s3",
        endpoint_url=require_env("FLOWNOTE_STORAGE_ENDPOINT"),
        region_name=os.environ.get("FLOWNOTE_STORAGE_REGION") or "auto",
        aws_access_key_id=require_env("FLOWNOTE_STORAGE_ACCESS_KEY_ID"),
        aws_secret_access_key=require_env("FLOWNOTE_STORAGE_SECRET_ACCESS_KEY"),
        config=Config(s3={"addressing_style": "path"}, signature_version="s3v4"),
    )


def load_canvas_ids(limit: int) -> list[str]:
    return json.loads(run_psql(f"""
        SELECT COALESCE(json_agg(id), '[]'::json)::text
        FROM (
            SELECT document.id::text AS id
            FROM canvas_documents document
            WHERE document.elements_object_key IS NULL
              AND EXISTS (
                  SELECT 1
                  FROM canvas_elements element
                  WHERE element.canvas_id = document.id
              )
            ORDER BY document.updated_at DESC, document.created_at DESC
            LIMIT {limit}
        ) rows;
    """) or "[]")


def load_element_rows(canvas_id: str) -> list[dict]:
    return json.loads(run_psql(f"""
        SELECT COALESCE(jsonb_agg(row_data), '[]'::jsonb)::text
        FROM (
            SELECT jsonb_build_object(
                'type', type,
                'payload', payload,
                'object_key', object_key
            ) AS row_data
            FROM canvas_elements
            WHERE canvas_id = {sql_string(canvas_id)}::uuid
            ORDER BY created_at ASC
        ) rows;
    """) or "[]")


def read_payload(client, bucket: str, row: dict) -> tuple[str, dict]:
    object_key = row.get("object_key") or ""
    if object_key:
        body = client.get_object(Bucket=bucket, Key=object_key)["Body"].read()
        payload = json.loads(body.decode("utf-8"))
    else:
        payload = row.get("payload") or {}
    return str(row.get("type") or ""), payload


def build_snapshot(client, bucket: str, rows: list[dict]) -> dict:
    snapshot = {"lines": [], "images": [], "textBoxes": []}
    with ThreadPoolExecutor(max_workers=min(24, max(1, len(rows)))) as executor:
        for element_type, payload in executor.map(lambda row: read_payload(client, bucket, row), rows):
            if element_type == "line":
                snapshot["lines"].append(payload)
            elif element_type == "image":
                snapshot["images"].append(payload)
            elif element_type == "textBox":
                snapshot["textBoxes"].append(payload)
    return snapshot


def put_snapshot(client, bucket: str, public_base_url: str, canvas_id: str, snapshot: dict, dry_run: bool) -> tuple[str, int, str]:
    object_key = f"canvas-snapshots/{canvas_id}/elements.json"
    body = json.dumps(snapshot, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    public_url = f"{public_base_url}/{object_key}"
    if not dry_run:
        client.put_object(
            Bucket=bucket,
            Key=object_key,
            Body=body,
            ContentType="application/json",
            ContentLength=len(body),
        )
    return object_key, len(body), public_url


def update_snapshot_location(canvas_id: str, object_key: str, byte_size: int, public_url: str, dry_run: bool) -> None:
    if dry_run:
        return
    run_psql(f"""
        UPDATE canvas_documents
        SET elements_object_key = {sql_string(object_key)},
            elements_byte_size = {byte_size},
            elements_public_url = {sql_string(public_url)}
        WHERE id = {sql_string(canvas_id)}::uuid;
    """)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Prebuild per-canvas R2 element snapshots.")
    parser.add_argument("--limit", type=int, default=100, help="Maximum canvas documents to warm in one run.")
    parser.add_argument("--dry-run", action="store_true", help="Build snapshots without writing R2 or DB updates.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.limit <= 0:
        raise RuntimeError("--limit must be greater than zero")

    client = s3_client()
    bucket = require_env("FLOWNOTE_STORAGE_BUCKET")
    public_base_url = require_env("FLOWNOTE_STORAGE_PUBLIC_BASE_URL").rstrip("/")
    canvas_ids = load_canvas_ids(args.limit)
    warmed = []
    for canvas_id in canvas_ids:
        rows = load_element_rows(canvas_id)
        snapshot = build_snapshot(client, bucket, rows)
        object_key, byte_size, public_url = put_snapshot(client, bucket, public_base_url, canvas_id, snapshot, args.dry_run)
        update_snapshot_location(canvas_id, object_key, byte_size, public_url, args.dry_run)
        warmed.append({
            "canvas_id": canvas_id,
            "elements": len(rows),
            "byte_size": byte_size,
        })
    print(json.dumps({"dry_run": args.dry_run, "warmed": warmed}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"snapshot warm-up failed: {exc}", file=sys.stderr)
        raise SystemExit(1)
