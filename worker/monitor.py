"""Kuyruk derinliği monitörü (Faz 3-lite).

Bekleyen iş sayısı eşiği ardışık N kontrolde aşarsa operatöre e-posta atar
(Resend). Autoscaler gelene kadar elle ölçekleme sinyali budur.
Çalıştırma: uv run python -m worker.monitor
"""

import os
import time

import requests
from loguru import logger

from app.config import config
from worker import queue
from worker.main import _redis_client

INTERVAL = int(os.getenv("MONITOR_INTERVAL_SECONDS", "60"))
THRESHOLD = int(os.getenv("QUEUE_ALERT_THRESHOLD", "5"))
STRIKES = int(os.getenv("MONITOR_STRIKES", "3"))
COOLDOWN = int(os.getenv("MONITOR_COOLDOWN_SECONDS", "3600"))


def should_alert(history: list[int], threshold: int, strikes: int) -> bool:
    if len(history) < strikes:
        return False
    return all(depth > threshold for depth in history[-strikes:])


def send_alert(depth: int) -> None:
    api_key = os.getenv("RESEND_API_KEY", "")
    to_email = os.getenv("QUEUE_ALERT_EMAIL", "")
    if not api_key or not to_email:
        logger.error(
            f"queue depth {depth} exceeds threshold but RESEND_API_KEY/"
            f"QUEUE_ALERT_EMAIL not configured; cannot send alert"
        )
        return
    response = requests.post(
        "https://api.resend.com/emails",
        headers={"Authorization": f"Bearer {api_key}"},
        json={
            "from": "Reelate Monitor <alerts@reelate.co>",
            "to": [to_email],
            "subject": f"Reelate queue backlog: {depth} jobs waiting",
            "text": (
                f"Pending queue depth is {depth} (threshold {THRESHOLD}).\n"
                "Consider adding a worker machine (see deploy/RUNBOOK.md, "
                "'Elle ölçekleme')."
            ),
        },
        timeout=15,
    )
    if response.status_code >= 300:
        logger.error(f"alert email failed: {response.status_code} {response.text}")
    else:
        logger.info(f"alert email sent (depth {depth})")


def run() -> None:
    r = _redis_client()
    host = config.app.get("redis_host", "localhost")
    logger.info(f"monitor redis target: {host}")
    history: list[int] = []
    last_alert = 0.0
    logger.info(
        f"queue monitor started (threshold {THRESHOLD}, strikes {STRIKES}, "
        f"interval {INTERVAL}s)"
    )
    while True:
        try:
            depth = int(r.llen(queue.PENDING_KEY))
            history = (history + [depth])[-STRIKES:]
            if (
                should_alert(history, THRESHOLD, STRIKES)
                and time.time() - last_alert > COOLDOWN
            ):
                send_alert(depth)
                last_alert = time.time()
        except Exception as e:
            logger.error(f"monitor loop error: {str(e)}")
        time.sleep(INTERVAL)


if __name__ == "__main__":
    run()
