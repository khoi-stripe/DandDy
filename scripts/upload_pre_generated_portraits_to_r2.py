"""
Upload pre-generated portrait PNGs to Cloudflare R2.

This script walks the local `generated_portraits/images/` directory and uploads
each PNG to the configured Cloudflare R2 bucket using the same S3-compatible
credentials the backend uses.

It is intended to make the "pre-generated" portrait set available as
public, cloud-hosted originals so the apps can show a "View Original Art"
image for those ASCII portraits.

Environment variables (same as backend):
  - R2_ACCOUNT_ID
  - R2_ACCESS_KEY_ID
  - R2_SECRET_ACCESS_KEY
  - R2_BUCKET_NAME

Optional (for reference in logs / config alignment):
  - R2_PUBLIC_BASE_URL  e.g. https://<account>.r2.dev/danddy-portraits

Example:
  cd scripts
  export R2_ACCOUNT_ID=...
  export R2_ACCESS_KEY_ID=...
  export R2_SECRET_ACCESS_KEY=...
  export R2_BUCKET_NAME=danddy-portraits
  python upload_pre_generated_portraits_to_r2.py
"""

import argparse
import os
from pathlib import Path
from typing import Tuple

import boto3
from botocore.exceptions import ClientError


def _get_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise SystemExit(f"Missing required environment variable: {name}")
    return value


def build_r2_client():
    """
    Build an S3-compatible client for Cloudflare R2.

    Mirrors the backend's `_get_r2_client` configuration so uploads behave
    consistently with runtime portrait uploads.
    """
    account_id = _get_env("R2_ACCOUNT_ID")
    access_key = _get_env("R2_ACCESS_KEY_ID")
    secret_key = _get_env("R2_SECRET_ACCESS_KEY")
    bucket_name = _get_env("R2_BUCKET_NAME")

    endpoint_url = f"https://{account_id}.r2.cloudflarestorage.com"

    client = boto3.client(
        "s3",
        endpoint_url=endpoint_url,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name="auto",
    )

    return client, bucket_name


def discover_images(images_dir: Path) -> Tuple[Path, ...]:
    if not images_dir.exists():
        raise SystemExit(f"Images directory does not exist: {images_dir}")
    if not images_dir.is_dir():
        raise SystemExit(f"Images path is not a directory: {images_dir}")

    images = tuple(sorted(images_dir.glob("*.png")))
    if not images:
        raise SystemExit(f"No .png files found in: {images_dir}")
    return images


def object_exists(client, bucket: str, key: str) -> bool:
    try:
        client.head_object(Bucket=bucket, Key=key)
        return True
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code")
        if code in ("404", "NoSuchKey", "NotFound"):
            return False
        # For permission or other errors, surface them.
        raise


def upload_images(
    images_dir: Path,
    key_prefix: str,
    dry_run: bool = False,
    overwrite: bool = False,
) -> None:
    client, bucket = build_r2_client()
    images = discover_images(images_dir)

    key_prefix = key_prefix.strip().lstrip("/").rstrip("/")
    print("☁️  Uploading pre-generated portraits to Cloudflare R2")
    print(f"   Bucket: {bucket}")
    print(f"   Prefix: {key_prefix}/")
    print(f"   Source: {images_dir}")
    print(f"   Count : {len(images)} file(s)")
    if dry_run:
        print("   Mode : DRY RUN (no writes will be performed)")
    else:
        print("   Mode : LIVE (objects will be created/updated)")

    uploaded = 0
    skipped = 0

    for img_path in images:
        filename = img_path.name
        key = f"{key_prefix}/{filename}"

        if not overwrite and object_exists(client, bucket, key):
            print(f"↩️  Skipping existing object: {key}")
            skipped += 1
            continue

        if dry_run:
            action = "Would upload" if not object_exists(client, bucket, key) else "Would overwrite"
            print(f"🔎 {action}: {img_path} -> s3://{bucket}/{key}")
            uploaded += 1
            continue

        with img_path.open("rb") as f:
            data = f.read()

        client.put_object(
            Bucket=bucket,
            Key=key,
            Body=data,
            ContentType="image/png",
        )
        print(f"✅ Uploaded: {img_path} -> s3://{bucket}/{key}")
        uploaded += 1

    print("\n📦 Upload summary")
    print(f"   Uploaded: {uploaded}")
    print(f"   Skipped : {skipped}")
    print(f"   Total   : {len(images)}")

    public_base = os.getenv("R2_PUBLIC_BASE_URL", "").strip()
    if public_base:
        public_base = public_base.rstrip("/")
        example = f"{public_base}/{key_prefix}/{images[0].name}"
        print("\n🌐 Example public URL (first image):")
        print(f"   {example}")
    else:
        print(
            "\nℹ️  Tip: Set R2_PUBLIC_BASE_URL to the public base of your bucket "
            "to compute public URLs in the frontend."
        )


def main():
    repo_root = Path(__file__).resolve().parents[1]
    default_images_dir = repo_root / "generated_portraits" / "images"

    parser = argparse.ArgumentParser(
        description="Upload pre-generated portrait PNGs to Cloudflare R2.",
    )
    parser.add_argument(
        "--images-dir",
        type=Path,
        default=default_images_dir,
        help=f"Directory containing pre-generated PNGs (default: {default_images_dir})",
    )
    parser.add_argument(
        "--prefix",
        type=str,
        default="portraits/pregen",
        help="Key prefix within the bucket to store images (default: portraits/pregen)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="List uploads without actually writing any objects",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Overwrite existing objects instead of skipping them",
    )

    args = parser.parse_args()
    upload_images(
        images_dir=args.images_dir,
        key_prefix=args.prefix,
        dry_run=args.dry_run,
        overwrite=args.overwrite,
    )


if __name__ == "__main__":
    main()


