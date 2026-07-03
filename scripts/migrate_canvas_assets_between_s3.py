#!/usr/bin/env python3
import argparse
import json
import os
import subprocess
import sys
import uuid
from urllib.parse import parse_qsl, urlparse

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError


def require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"{name} is required")
    return value


def s3_client(prefix: str):
    return boto3.client(
        "s3",
        endpoint_url=require_env(f"{prefix}_ENDPOINT"),
        region_name=os.environ.get(f"{prefix}_REGION") or "auto",
        aws_access_key_id=require_env(f"{prefix}_ACCESS_KEY_ID"),
        aws_secret_access_key=require_env(f"{prefix}_SECRET_ACCESS_KEY"),
        config=Config(s3={"addressing_style": "path"}, signature_version="s3v4"),
    )


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


def check_destination(client, bucket: str) -> None:
    key = f"healthcheck/{uuid.uuid4().hex}.txt"
    body = b"ok"
    client.put_object(Bucket=bucket, Key=key, Body=body, ContentType="text/plain")
    try:
        actual = client.get_object(Bucket=bucket, Key=key)["Body"].read()
        if actual != body:
            raise RuntimeError("Destination storage read/write check returned unexpected content")
    finally:
        client.delete_object(Bucket=bucket, Key=key)


def object_exists(client, bucket: str, key: str) -> bool:
    try:
        client.head_object(Bucket=bucket, Key=key)
        return True
    except ClientError as exc:
        status = exc.response.get("ResponseMetadata", {}).get("HTTPStatusCode")
        if status == 404:
            return False
        raise


def load_rows(limit: int) -> list[dict]:
    return json.loads(run_psql(f"""
        SELECT COALESCE(jsonb_agg(row_data), '[]'::jsonb)::text
        FROM (
            SELECT jsonb_build_object(
                'id', id,
                'canvas_id', canvas_id,
                'payload', payload
            ) AS row_data
            FROM canvas_elements
            WHERE type = 'image'
              AND payload ? 'objectKey'
            ORDER BY updated_at ASC, created_at ASC
            LIMIT {limit}
        ) rows;
    """) or "[]")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Copy canvas image objects from the source S3 bucket to R2 and rewrite public URLs.")
    parser.add_argument("--limit", type=int, default=500, help="Maximum image element rows to process in one run.")
    parser.add_argument("--dry-run", action="store_true", help="Check rows without copying objects or committing DB updates.")
    parser.add_argument("--skip-destination-check", action="store_true", help="Skip destination R2 put/get/delete smoke test.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.limit <= 0:
        raise RuntimeError("--limit must be greater than zero")

    source = s3_client("SOURCE_STORAGE")
    destination = s3_client("FLOWNOTE_STORAGE")
    source_bucket = require_env("SOURCE_STORAGE_BUCKET")
    destination_bucket = require_env("FLOWNOTE_STORAGE_BUCKET")
    public_base_url = require_env("FLOWNOTE_STORAGE_PUBLIC_BASE_URL").rstrip("/")

    if not args.dry_run and not args.skip_destination_check:
        check_destination(destination, destination_bucket)

    rows = load_rows(args.limit)
    copied = 0
    already_present = 0
    updated = 0
    statements = ["BEGIN;"]

    for row in rows:
        payload = row.get("payload") or {}
        object_key = payload.get("objectKey")
        if not object_key:
            continue

        if args.dry_run:
            already_present += 1
        elif object_exists(destination, destination_bucket, object_key):
            already_present += 1
        else:
            source_object = source.get_object(Bucket=source_bucket, Key=object_key)
            destination.put_object(
                Bucket=destination_bucket,
                Key=object_key,
                Body=source_object["Body"].read(),
                ContentType=source_object.get("ContentType") or payload.get("contentType") or "application/octet-stream",
            )
            copied += 1

        next_url = f"{public_base_url}/{object_key}"
        if payload.get("url") != next_url:
            next_payload = dict(payload)
            next_payload["url"] = next_url
            statements.append(
                "UPDATE canvas_elements "
                f"SET payload = {jsonb_literal(next_payload)}, updated_at = NOW(), revision = revision + 1 "
                f"WHERE canvas_id = {sql_string(row['canvas_id'])}::uuid AND id = {sql_string(row['id'])};"
            )
            updated += 1

    statements.append("ROLLBACK;" if args.dry_run else "COMMIT;")
    if updated:
        run_psql("\n".join(statements))

    print(json.dumps({
        "dry_run": args.dry_run,
        "limit": args.limit,
        "image_elements": len(rows),
        "copied_objects": copied,
        "already_present_objects": already_present,
        "updated_payload_urls": updated,
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"migration failed: {exc}", file=sys.stderr)
        raise SystemExit(1)
