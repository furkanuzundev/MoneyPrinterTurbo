"""Reelate SLO benchmark: tam pipeline'ı sabit senaryoyla koşup aşama
sürelerini ölçer. LLM adımı dahil değildir (senaryo sabit; spec Bölüm 3:
LLM sihirbazda, SLO saati dışında).

Kullanım: uv run python scripts/benchmark_slo.py [--aspect 9:16] [--label mac-local]
Gereksinim: config.toml'da geçerli Pexels API key.
"""

import argparse
import functools
import json
import os
import sys
import time
import uuid

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.models.schema import VideoParams
from app.services import task as task_svc
from app.utils import utils

STAGES = {
    "generate_audio": "tts",
    "generate_subtitle": "subtitle",
    "get_video_materials": "download",
    "generate_final_videos": "render",
}
TIMINGS: dict[str, float] = {}


def _instrument(func_name: str, label: str):
    original = getattr(task_svc, func_name)

    @functools.wraps(original)
    def wrapper(*args, **kwargs):
        started = time.perf_counter()
        try:
            return original(*args, **kwargs)
        finally:
            TIMINGS[label] = time.perf_counter() - started

    setattr(task_svc, func_name, wrapper)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--aspect", default="9:16", choices=["9:16", "16:9", "1:1"])
    parser.add_argument("--label", default="unlabeled")
    args = parser.parse_args()

    script_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "test/resources/script-60s.txt",
    )
    with open(script_path, encoding="utf-8") as f:
        script = f.read().strip()

    for func_name, label in STAGES.items():
        _instrument(func_name, label)

    params = VideoParams(
        video_subject="morning habits benchmark",
        video_script=script,
        video_terms=["morning", "coffee", "sunrise", "journal", "stretching"],
        video_aspect=args.aspect,
        voice_name="en-US-JennyNeural-Female",
        subtitle_enabled=True,
    )
    task_id = f"benchmark-{uuid.uuid4()}"
    started = time.perf_counter()
    result = task_svc.start(task_id, params)
    total = time.perf_counter() - started

    if not result:
        print("BENCHMARK FAILED: task produced no result", file=sys.stderr)
        sys.exit(1)

    report = {
        "label": args.label,
        "aspect": args.aspect,
        "task_id": task_id,
        "stages_seconds": {k: round(v, 2) for k, v in TIMINGS.items()},
        "total_seconds": round(total, 2),
        "videos": result.get("videos", []),
    }
    out_dir = utils.storage_dir("benchmarks", create=True)
    out_file = os.path.join(out_dir, f"benchmark-{int(time.time())}.json")
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)

    print(f"\n{'Stage':<12} {'Seconds':>8}")
    print("-" * 21)
    for stage in ["tts", "subtitle", "download", "render"]:
        print(f"{stage:<12} {TIMINGS.get(stage, 0):>8.1f}")
    print("-" * 21)
    print(f"{'TOTAL':<12} {total:>8.1f}")
    print(f"\nreport: {out_file}")


if __name__ == "__main__":
    main()
