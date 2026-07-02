"""Reelate güvenilir iş kuyruğu.

Desen: BRPOPLPUSH ile pending -> processing:{worker_id}. Worker canlılığı
heartbeat anahtarıyla izlenir; heartbeat'i düşen worker'ın processing
listesi requeue_stale ile pending'e geri taşınır. Böylece worker/makine
ölümünde iş kaybolmaz (spec Bölüm 3/9).

Sözleşme: claim() ilk heartbeat'i kendisi set eder (pop işleminden önce),
böylece iş processing listesine taşındığı andan itibaren worker canlı
görünür ve requeue_stale ile arada çalınamaz. Çağıran taraf, işi
işlerken TTL'den daha kısa aralıklarla heartbeat() çağırmaya devam
etmelidir; aksi halde worker hâlâ çalışıyor olsa bile ölü sayılıp işi
geri kuyruğa alınabilir.
"""

import json

PENDING_KEY = "reelate:queue:pending"
PROCESSING_KEY_PREFIX = "reelate:queue:processing:"
HEARTBEAT_KEY_PREFIX = "reelate:worker:alive:"
HEARTBEAT_TTL_SECONDS = 30


def _processing_key(worker_id: str) -> str:
    return f"{PROCESSING_KEY_PREFIX}{worker_id}"


def _heartbeat_key(worker_id: str) -> str:
    return f"{HEARTBEAT_KEY_PREFIX}{worker_id}"


def enqueue(r, task_id: str, params: dict, attempts: int = 0) -> None:
    payload = json.dumps(
        {"task_id": task_id, "params": params, "attempts": attempts}
    )
    r.lpush(PENDING_KEY, payload)


def claim(r, worker_id: str, timeout: int = 5):
    heartbeat(r, worker_id)  # claim anından itibaren canlı görün: requeue_stale yarışını kapatır
    if timeout > 0:
        raw = r.brpoplpush(PENDING_KEY, _processing_key(worker_id), timeout=timeout)
    else:
        raw = r.rpoplpush(PENDING_KEY, _processing_key(worker_id))
    if raw is None:
        return None
    raw = raw.decode() if isinstance(raw, bytes) else raw
    return json.loads(raw), raw


def complete(r, worker_id: str, raw: str) -> None:
    r.lrem(_processing_key(worker_id), 1, raw)


def heartbeat(r, worker_id: str, ttl: int = HEARTBEAT_TTL_SECONDS) -> None:
    r.set(_heartbeat_key(worker_id), "1", ex=ttl)


def requeue_stale(r) -> int:
    moved = 0
    for key in r.scan_iter(match=f"{PROCESSING_KEY_PREFIX}*"):
        key_str = key.decode() if isinstance(key, bytes) else key
        worker_id = key_str[len(PROCESSING_KEY_PREFIX):]
        if r.exists(_heartbeat_key(worker_id)):
            continue
        while r.rpoplpush(key_str, PENDING_KEY) is not None:
            moved += 1
    return moved
