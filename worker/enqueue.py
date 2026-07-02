"""Test amaçlı iş kuyruklama CLI'si.

Örnek:
  uv run python -m worker.enqueue --subject "morning habits" \
      --script-file test/resources/script-60s.txt --terms "morning,coffee,sunrise"
"""

import argparse
import uuid

from worker import queue
from worker.main import _redis_client


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--subject", required=True)
    parser.add_argument("--script-file", default="")
    parser.add_argument("--terms", default="")
    parser.add_argument("--aspect", default="9:16", choices=["9:16", "16:9", "1:1"])
    parser.add_argument("--voice", default="en-US-JennyNeural-Female")
    args = parser.parse_args()

    script = ""
    if args.script_file:
        with open(args.script_file, encoding="utf-8") as f:
            script = f.read().strip()

    params = {
        "video_subject": args.subject,
        "video_script": script,
        "video_terms": [t.strip() for t in args.terms.split(",") if t.strip()],
        "video_aspect": args.aspect,
        "voice_name": args.voice,
        "subtitle_enabled": True,
    }
    task_id = str(uuid.uuid4())
    queue.enqueue(_redis_client(), task_id, params)
    print(task_id)


if __name__ == "__main__":
    main()
