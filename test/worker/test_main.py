import json

import fakeredis
import pytest

from worker import main as worker_main
from worker import queue


def _redis():
    return fakeredis.FakeStrictRedis()


def _claimed(r, subject="cats", attempts=0):
    queue.enqueue(r, "task-1", {"video_subject": subject}, attempts=attempts)
    return queue.claim(r, "worker-a", timeout=0)


def test_success_completes_job(monkeypatch):
    r = _redis()
    calls = {}

    def fake_start(task_id, params, stop_at="video"):
        calls["task_id"] = task_id
        calls["subject"] = params.video_subject
        return {"videos": ["/tmp/final-1.mp4"]}

    monkeypatch.setattr(worker_main.tm, "start", fake_start)
    job, raw = _claimed(r)
    assert worker_main.process_job(r, "worker-a", job, raw) is True
    assert calls == {"task_id": "task-1", "subject": "cats"}
    assert r.llen("reelate:queue:processing:worker-a") == 0
    assert r.llen(queue.PENDING_KEY) == 0


def test_failure_requeues_with_attempt(monkeypatch):
    r = _redis()

    def fake_start(task_id, params, stop_at="video"):
        raise RuntimeError("render exploded")

    monkeypatch.setattr(worker_main.tm, "start", fake_start)
    job, raw = _claimed(r)
    assert worker_main.process_job(r, "worker-a", job, raw) is False
    assert r.llen(queue.PENDING_KEY) == 1
    requeued, _ = queue.claim(r, "worker-b", timeout=0)
    assert requeued["attempts"] == 1


def test_final_failure_marks_task_failed(monkeypatch):
    r = _redis()
    states = {}

    def fake_start(task_id, params, stop_at="video"):
        raise RuntimeError("still broken")

    def fake_update(task_id, **kwargs):
        states[task_id] = kwargs

    monkeypatch.setattr(worker_main.tm, "start", fake_start)
    monkeypatch.setattr(worker_main.sm.state, "update_task", fake_update)
    job, raw = _claimed(r, attempts=1)  # bu ikinci deneme
    assert worker_main.process_job(r, "worker-a", job, raw) is False
    assert r.llen(queue.PENDING_KEY) == 0  # tekrar kuyruğa girmedi
    assert states["task-1"]["state"] == worker_main.const.TASK_STATE_FAILED


def test_empty_result_treated_as_failure(monkeypatch):
    # task.start() zaten kendi terminal FAILED durumunu yazdı (falsy dönüş =
    # pipeline içi kalıcı başarısızlık); worker bunu retry etmemeli ve
    # kendisi de update_task çağırmamalı (state zaten yazıldı).
    r = _redis()
    state_calls = []
    monkeypatch.setattr(
        worker_main.tm, "start", lambda task_id, params, stop_at="video": None
    )
    monkeypatch.setattr(
        worker_main.sm.state,
        "update_task",
        lambda task_id, **kwargs: state_calls.append((task_id, kwargs)),
    )
    job, raw = _claimed(r)
    assert worker_main.process_job(r, "worker-a", job, raw) is False
    assert r.llen(queue.PENDING_KEY) == 0
    assert r.llen("reelate:queue:processing:worker-a") == 0
    assert state_calls == []


def test_failure_path_enqueues_before_complete(monkeypatch):
    r = _redis()
    order = []
    # Job kurulumu (kendi içinde queue.enqueue çağırır) patch'lerden ÖNCE yapılır;
    # worker_main.queue ile queue aynı modül nesnesi olduğundan patch sonrası
    # yapılan her enqueue/complete çağrısı (kurulum dahil) order'a yazılırdı.
    job, raw = _claimed(r)
    real_enqueue, real_complete = queue.enqueue, queue.complete
    monkeypatch.setattr(
        worker_main.queue,
        "enqueue",
        lambda *a, **k: (order.append("enqueue"), real_enqueue(*a, **k))[1],
    )
    monkeypatch.setattr(
        worker_main.queue,
        "complete",
        lambda *a, **k: (order.append("complete"), real_complete(*a, **k))[1],
    )

    def fake_start(task_id, params, stop_at="video"):
        raise RuntimeError("boom")

    monkeypatch.setattr(worker_main.tm, "start", fake_start)
    worker_main.process_job(r, "worker-a", job, raw)
    assert order == ["enqueue", "complete"]


def test_invalid_params_fail_without_retry(monkeypatch):
    r = _redis()
    state_calls = []
    monkeypatch.setattr(
        worker_main.sm.state,
        "update_task",
        lambda task_id, **kwargs: state_calls.append((task_id, kwargs)),
    )
    # video_subject eksik (zorunlu alan) ve video_aspect geçersiz enum:
    # deterministik doğrulama hatası, retry anlamsız.
    payload = json.dumps(
        {"task_id": "task-1", "params": {"video_aspect": "4:5"}, "attempts": 0}
    )
    r.lpush(queue.PENDING_KEY, payload)
    job, raw = queue.claim(r, "worker-a", timeout=0)
    assert worker_main.process_job(r, "worker-a", job, raw) is False
    assert r.llen(queue.PENDING_KEY) == 0
    assert r.llen("reelate:queue:processing:worker-a") == 0
    assert state_calls == [("task-1", {"state": worker_main.const.TASK_STATE_FAILED})]


def test_run_exits_without_redis_enabled(monkeypatch):
    # MemoryState süreç-içi (per-process) tutulur; enable_redis kapalıyken
    # worker çalışırsa task durumları sessizce kaybolur. Erken ve gürültülü
    # şekilde fail etmeli.
    monkeypatch.setattr(worker_main.config, "app", {})
    with pytest.raises(SystemExit):
        worker_main.run()
