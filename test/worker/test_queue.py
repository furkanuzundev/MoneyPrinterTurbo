import json

import fakeredis

from worker import queue


def _redis():
    return fakeredis.FakeStrictRedis()


def test_enqueue_claim_roundtrip():
    r = _redis()
    queue.enqueue(r, "task-1", {"video_subject": "cats"})
    result = queue.claim(r, "worker-a", timeout=0)
    assert result is not None
    job, raw = result
    assert job["task_id"] == "task-1"
    assert job["params"] == {"video_subject": "cats"}
    assert job["attempts"] == 0
    # iş pending'den processing'e taşındı
    assert r.llen(queue.PENDING_KEY) == 0
    assert r.llen("reelate:queue:processing:worker-a") == 1
    assert json.loads(raw)["task_id"] == "task-1"


def test_claim_empty_returns_none():
    r = _redis()
    assert queue.claim(r, "worker-a", timeout=0) is None


def test_complete_removes_from_processing():
    r = _redis()
    queue.enqueue(r, "task-1", {})
    job, raw = queue.claim(r, "worker-a", timeout=0)
    queue.complete(r, "worker-a", raw)
    assert r.llen("reelate:queue:processing:worker-a") == 0


def test_requeue_stale_moves_dead_workers_jobs():
    r = _redis()
    queue.enqueue(r, "task-1", {})
    queue.claim(r, "dead-worker", timeout=0)  # heartbeat yok -> ölü
    moved = queue.requeue_stale(r)
    assert moved == 1
    assert r.llen(queue.PENDING_KEY) == 1
    assert r.llen("reelate:queue:processing:dead-worker") == 0


def test_requeue_stale_keeps_alive_workers_jobs():
    r = _redis()
    queue.enqueue(r, "task-1", {})
    queue.claim(r, "worker-a", timeout=0)
    queue.heartbeat(r, "worker-a")
    moved = queue.requeue_stale(r)
    assert moved == 0
    assert r.llen("reelate:queue:processing:worker-a") == 1


def test_attempts_preserved_through_requeue():
    r = _redis()
    queue.enqueue(r, "task-1", {}, attempts=1)
    queue.claim(r, "dead-worker", timeout=0)
    queue.requeue_stale(r)
    job, _ = queue.claim(r, "worker-b", timeout=0)
    assert job["attempts"] == 1
