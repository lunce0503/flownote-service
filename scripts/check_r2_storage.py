#!/usr/bin/env python3
import os
import sys
import uuid

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError


def require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"{name} is required")
    return value


def main() -> int:
    bucket = require_env("FLOWNOTE_STORAGE_BUCKET")
    client = boto3.client(
        "s3",
        endpoint_url=require_env("FLOWNOTE_STORAGE_ENDPOINT"),
        region_name=os.environ.get("FLOWNOTE_STORAGE_REGION") or "auto",
        aws_access_key_id=require_env("FLOWNOTE_STORAGE_ACCESS_KEY_ID"),
        aws_secret_access_key=require_env("FLOWNOTE_STORAGE_SECRET_ACCESS_KEY"),
        config=Config(s3={"addressing_style": "path"}, signature_version="s3v4"),
    )
    object_key = f"healthcheck/{uuid.uuid4().hex}.txt"
    expected = b"ok"
    try:
        client.put_object(Bucket=bucket, Key=object_key, Body=expected, ContentType="text/plain")
        actual = client.get_object(Bucket=bucket, Key=object_key)["Body"].read()
        if actual != expected:
            raise RuntimeError("R2 read/write check returned unexpected content")
        client.delete_object(Bucket=bucket, Key=object_key)
    except ClientError as exc:
        error = exc.response.get("Error", {})
        status = exc.response.get("ResponseMetadata", {}).get("HTTPStatusCode")
        raise RuntimeError(f"R2 read/write check failed: code={error.get('Code')} status={status}") from exc
    print("R2 read/write check passed")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(exc, file=sys.stderr)
        raise SystemExit(1)
