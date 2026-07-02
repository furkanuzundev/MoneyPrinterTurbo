import fakeredis

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
    r = _redis()
    monkeypatch.setattr(
        worker_main.tm, "start", lambda task_id, params, stop_at="video": None
    )
    job, raw = _claimed(r)
    assert worker_main.process_job(r, "worker-a", job, raw) is False
    assert r.llen(queue.PENDING_KEY) == 1
