import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from app.services import storage as st


class TestLocalStorage(unittest.TestCase):
    def setUp(self):
        self.root = tempfile.mkdtemp()

    def _local(self):
        # storage_dir() root'unu geçici dizine çevir
        patcher = patch("app.services.storage.utils.storage_dir", return_value=self.root)
        patcher.start()
        self.addCleanup(patcher.stop)
        return st.LocalStorage()

    def test_put_then_get_roundtrip(self):
        local = self._local()
        src = os.path.join(self.root, "src.txt")
        with open(src, "w") as f:
            f.write("hello")
        local.put(src, "tasks/abc/final-1.mp4")
        self.assertTrue(local.exists("tasks/abc/final-1.mp4"))
        dst = os.path.join(self.root, "dst.txt")
        local.get("tasks/abc/final-1.mp4", dst)
        with open(dst) as f:
            self.assertEqual(f.read(), "hello")

    def test_delete_prefix_removes_task_dir(self):
        local = self._local()
        src = os.path.join(self.root, "src.txt")
        with open(src, "w") as f:
            f.write("x")
        local.put(src, "tasks/abc/final-1.mp4")
        local.delete_prefix("tasks/abc/")
        self.assertFalse(local.exists("tasks/abc/final-1.mp4"))


class TestS3Storage(unittest.TestCase):
    def setUp(self):
        try:
            from moto import mock_aws
        except ImportError:
            self.skipTest("moto not installed")
        self._mock = mock_aws()
        self._mock.start()
        self.addCleanup(self._mock.stop)
        import boto3

        self._boto = boto3.client("s3", region_name="us-east-1")
        self._boto.create_bucket(Bucket="test-bucket")
        cfg = {
            "s3_bucket": "test-bucket",
            "s3_endpoint": None,
            "s3_region": "us-east-1",
            "s3_access_key": "test",
            "s3_secret_key": "test",
        }
        patcher = patch.object(st.config, "app", cfg)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.root = tempfile.mkdtemp()

    def test_put_get_exists_delete(self):
        s3 = st.S3Storage()
        src = os.path.join(self.root, "src.txt")
        with open(src, "w") as f:
            f.write("data")
        s3.put(src, "tasks/xyz/final-1.mp4")
        self.assertTrue(s3.exists("tasks/xyz/final-1.mp4"))
        dst = os.path.join(self.root, "out.txt")
        s3.get("tasks/xyz/final-1.mp4", dst)
        with open(dst) as f:
            self.assertEqual(f.read(), "data")
        s3.delete_prefix("tasks/xyz/")
        self.assertFalse(s3.exists("tasks/xyz/final-1.mp4"))

    def test_presigned_get_returns_url(self):
        s3 = st.S3Storage()
        url = s3.presigned_get("tasks/xyz/final-1.mp4", ttl=900)
        self.assertIn("tasks/xyz/final-1.mp4", url)
        self.assertTrue(url.startswith("http"))


if __name__ == "__main__":
    unittest.main()
