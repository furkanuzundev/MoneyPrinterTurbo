"""Depolama soyutlaması: yerel disk veya S3 uyumlu bucket (Hetzner Object Storage).

Backend config.toml'daki storage_backend ile seçilir ("local" | "s3").
Anahtar (key) formatı worker ve web arasında ortaktır: tasks/<task_id>/<dosya>.
"""

import os
import shutil

from loguru import logger

from app.config import config
from app.utils import utils


class Storage:
    def put(self, local_path: str, key: str) -> None:
        raise NotImplementedError

    def get(self, key: str, local_path: str) -> None:
        raise NotImplementedError

    def delete_prefix(self, prefix: str) -> None:
        raise NotImplementedError

    def presigned_get(self, key: str, ttl: int = 900) -> str:
        raise NotImplementedError

    def exists(self, key: str) -> bool:
        raise NotImplementedError


class LocalStorage(Storage):
    """key'i storage_dir() altına map eder. Mevcut yerel-dosya davranışı."""

    def _path(self, key: str) -> str:
        return os.path.join(utils.storage_dir(), key)

    def put(self, local_path: str, key: str) -> None:
        dst = self._path(key)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        if os.path.abspath(local_path) != os.path.abspath(dst):
            shutil.copy2(local_path, dst)

    def get(self, key: str, local_path: str) -> None:
        src = self._path(key)
        os.makedirs(os.path.dirname(local_path), exist_ok=True)
        if os.path.abspath(src) != os.path.abspath(local_path):
            shutil.copy2(src, local_path)

    def delete_prefix(self, prefix: str) -> None:
        target = self._path(prefix.rstrip("/"))
        if os.path.isdir(target):
            shutil.rmtree(target, ignore_errors=True)

    def presigned_get(self, key: str, ttl: int = 900) -> str:
        return "file://" + self._path(key)

    def exists(self, key: str) -> bool:
        return os.path.exists(self._path(key))


class S3Storage(Storage):
    """Hetzner Object Storage (S3 uyumlu). boto3 ile konuşur."""

    def __init__(self):
        import boto3

        self._bucket = config.app.get("s3_bucket")
        self._client = boto3.client(
            "s3",
            endpoint_url=config.app.get("s3_endpoint"),
            region_name=config.app.get("s3_region"),
            aws_access_key_id=config.app.get("s3_access_key"),
            aws_secret_access_key=config.app.get("s3_secret_key"),
        )

    def put(self, local_path: str, key: str) -> None:
        self._client.upload_file(local_path, self._bucket, key)

    def get(self, key: str, local_path: str) -> None:
        os.makedirs(os.path.dirname(local_path), exist_ok=True)
        self._client.download_file(self._bucket, key, local_path)

    def delete_prefix(self, prefix: str) -> None:
        paginator = self._client.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=self._bucket, Prefix=prefix):
            objs = [{"Key": o["Key"]} for o in page.get("Contents", [])]
            if objs:
                self._client.delete_objects(
                    Bucket=self._bucket, Delete={"Objects": objs}
                )

    def presigned_get(self, key: str, ttl: int = 900) -> str:
        return self._client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self._bucket, "Key": key},
            ExpiresIn=ttl,
        )

    def exists(self, key: str) -> bool:
        from botocore.exceptions import ClientError

        try:
            self._client.head_object(Bucket=self._bucket, Key=key)
            return True
        except ClientError:
            return False


_storage = None


def get_storage() -> Storage:
    global _storage
    if _storage is None:
        backend = str(config.app.get("storage_backend", "local")).strip().lower()
        if backend == "s3":
            logger.info("storage backend: s3")
            _storage = S3Storage()
        else:
            logger.info("storage backend: local")
            _storage = LocalStorage()
    return _storage
