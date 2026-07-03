#!/usr/bin/env python3
import base64
import json
import mimetypes
import os
import re
import subprocess
import sys
import tempfile
import uuid

import boto3
from botocore.config import Config


DATA_URL_RE = re.compile(r"^data:(image/[a-zA-Z0-9.+-]+);base64,(.*)$", re.DOTALL)


def require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"{name} is required")
    return value


def run_psql(database_url: str, sql: str) -> str:
    completed = subprocess.run(
        ["psql", database_url, "-X", "-q", "-tA", "-v", "ON_ERROR_STOP=1"],
        input=sql,
        text=True,
        capture_output=True,
        check=True,
    )
    return completed.stdout


def sql_string(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def json_literal(value: object) -> str:
    return "$json$" + json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "$json$::jsonb"


def extension_for(content_type: str) -> str:
    guessed = mimetypes.guess_extension(content_type) or ""
    if guessed == ".jpe":
        return ".jpg"
    return guessed


def main() -> int:
    database_url = os.environ.get("DATABASE_PUBLIC_URL") or require_env("DATABASE_URL")
    endpoint = require_env("FLOWNOTE_STORAGE_ENDPOINT")
    bucket = require_env("FLOWNOTE_STORAGE_BUCKET")
    region = os.environ.get("FLOWNOTE_STORAGE_REGION") or "us-east-1"
    access_key = require_env("FLOWNOTE_STORAGE_ACCESS_KEY_ID")
    secret_key = require_env("FLOWNOTE_STORAGE_SECRET_ACCESS_KEY")
    asset_base_url = os.environ.get("CANVAS_ASSET_BASE_URL", "https://flownote-production.up.railway.app/api/canvas/assets").rstrip("/")

    raw = run_psql(
        database_url,
        """
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'canvas_id', id,
            'user_id', user_id,
            'images', images
        )), '[]'::jsonb)::text
        FROM canvas_documents
        WHERE images::text LIKE '%data:image/%';
        """,
    )
    documents = json.loads(raw.strip() or "[]")

    s3 = boto3.client(
        "s3",
        endpoint_url=endpoint,
        region_name=region,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        config=Config(s3={"addressing_style": "path"}),
    )

    migrated = 0
    sql_statements = ["BEGIN;"]

    for document in documents:
        canvas_id = document["canvas_id"]
        user_id = document["user_id"]
        next_images = []
        changed = False

        for image in document.get("images") or []:
            image = dict(image)
            url = image.get("url")
            if not isinstance(url, str):
                next_images.append(image)
                continue

            match = DATA_URL_RE.match(url)
            if not match:
                next_images.append(image)
                continue

            content_type = match.group(1)
            data = base64.b64decode(match.group(2), validate=True)
            asset_id = str(uuid.uuid4())
            object_key = f"canvas/{user_id}/{asset_id}{extension_for(content_type)}"

            s3.put_object(
                Bucket=bucket,
                Key=object_key,
                Body=data,
                ContentType=content_type,
                ContentLength=len(data),
            )

            sql_statements.append(
                "INSERT INTO canvas_assets (id, user_id, object_key, content_type, byte_size) "
                f"VALUES ({sql_string(asset_id)}::uuid, {sql_string(user_id)}::uuid, "
                f"{sql_string(object_key)}, {sql_string(content_type)}, {len(data)}) "
                "ON CONFLICT (object_key) DO NOTHING;"
            )

            image["url"] = f"{asset_base_url}/{asset_id}"
            image["assetId"] = asset_id
            image["objectKey"] = object_key
            image["contentType"] = content_type
            image["byteSize"] = len(data)
            next_images.append(image)
            migrated += 1
            changed = True

        if changed:
            sql_statements.append(
                "UPDATE canvas_documents "
                f"SET images = {json_literal(next_images)}, revision = revision + 1, updated_at = NOW() "
                f"WHERE id = {sql_string(canvas_id)}::uuid AND user_id = {sql_string(user_id)}::uuid;"
            )
            sql_statements.append(
                f"DELETE FROM canvas_elements WHERE canvas_id = {sql_string(canvas_id)}::uuid "
                f"AND user_id = {sql_string(user_id)}::uuid AND type = 'image';"
            )
            for image in next_images:
                image_id = image.get("id")
                if isinstance(image_id, str) and image_id:
                    sql_statements.append(
                        "INSERT INTO canvas_elements (id, canvas_id, user_id, type, payload) "
                        f"VALUES ({sql_string(image_id)}, {sql_string(canvas_id)}::uuid, {sql_string(user_id)}::uuid, "
                        f"'image', {json_literal(image)}) "
                        "ON CONFLICT (canvas_id, id) DO UPDATE SET "
                        "type = EXCLUDED.type, payload = EXCLUDED.payload, "
                        "revision = canvas_elements.revision + 1, updated_at = NOW();"
                    )

    sql_statements.append("COMMIT;")

    if migrated:
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", delete=False) as sql_file:
            sql_file.write("\n".join(sql_statements))
            sql_path = sql_file.name
        try:
            subprocess.run(
                ["psql", database_url, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-f", sql_path],
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
                text=True,
            )
        finally:
            os.unlink(sql_path)

    print(json.dumps({"migrated_images": migrated, "documents_scanned": len(documents)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"migration failed: {exc}", file=sys.stderr)
        raise
