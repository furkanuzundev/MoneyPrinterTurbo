"""Reelate render worker: Redis kuyruğundan iş çeker, video üretir.

Çalıştırma: uv run python -m worker.main
Gereksinim: config.toml'da enable_redis=true ve redis_* ayarları.
"""

import os
import socket
import threading
import time

from loguru import logger

from app.config import config
from app.models import const
from app.models.schema import VideoParams
from app.services import state as sm
from app.services import task as tm
from worker import queue

MAX_ATTEMPTS = 2
CLAIM_TIMEOUT_SECONDS = 5
HEARTBEAT_INTERVAL_SECONDS = 10


def _redis_client():
    import redis

    return redis.Redis(
        host=config.app.get("redis_host", "localhost"),
        port=int(config.app.get("redis_port", 6379)),
        db=int(config.app.get("redis_db", 0)),
        password=config.app.get("redis_password") or None,
    )


def process_job(r, worker_id: str, job: dict, raw: str) -> bool:
    task_id = job["task_id"]
    attempts = int(job.get("attempts", 0))
    logger.info(f"processing task {task_id} (attempt {attempts + 1}/{MAX_ATTEMPTS})")
    try:
        params = VideoParams(**job["params"])
        result = tm.start(task_id, params)
        if not result:
            raise RuntimeError("task returned no result")
        queue.complete(r, worker_id, raw)
        logger.success(f"task {task_id} completed")
        return True
    except Exception as e:
        logger.error(f"task {task_id} failed: {str(e)}")
        queue.complete(r, worker_id, raw)
        if attempts + 1 < MAX_ATTEMPTS:
            queue.enqueue(r, task_id, job["params"], attempts=attempts + 1)
            logger.info(f"task {task_id} requeued")
        else:
            sm.state.update_task(task_id, state=const.TASK_STATE_FAILED)
            logger.error(f"task {task_id} permanently failed")
        return False


def _heartbeat_loop(r, worker_id: str, stop: threading.Event):
    while not stop.is_set():
        try:
            queue.heartbeat(r, worker_id)
        except Exception as e:
            logger.warning(f"heartbeat failed: {str(e)}")
        stop.wait(HEARTBEAT_INTERVAL_SECONDS)


def run() -> None:
    worker_id = f"{socket.gethostname()}-{os.getpid()}"
    r = _redis_client()
    stop = threading.Event()
    threading.Thread(
        target=_heartbeat_loop, args=(r, worker_id, stop), daemon=True
    ).start()
    logger.info(f"worker {worker_id} started, waiting for jobs")
    try:
        while True:
            try:
                queue.requeue_stale(r)
                claimed = queue.claim(r, worker_id, timeout=CLAIM_TIMEOUT_SECONDS)
                if claimed is None:
                    continue
                job, raw = claimed
                process_job(r, worker_id, job, raw)
            except KeyboardInterrupt:
                raise
            except Exception as e:
                logger.error(f"worker loop error: {str(e)}")
                time.sleep(2)
    except KeyboardInterrupt:
        logger.info("worker shutting down")
    finally:
        stop.set()


if __name__ == "__main__":
    run()
