import os
from uuid import uuid4

from fastapi import BackgroundTasks
from fastapi.responses import FileResponse
from loguru import logger

from app.controllers.v1.base import new_router
from app.models.exception import HttpException
from app.models.schema import VoicePreviewRequest
from app.services import voice as voice_service
from app.utils import utils

router = new_router()

_FALLBACK_TEXT = "This is a sample voice."


@router.post("/voice/preview")
def voice_preview(request: VoicePreviewRequest, background_tasks: BackgroundTasks):
    voice_name = request.voice_name
    if not voice_name:
        raise HttpException(task_id="", status_code=400, message="voice_name is required")

    if not voice_service.is_known_previewable_voice(voice_name):
        raise HttpException(task_id="", status_code=400, message="unknown voice")

    text = request.text or voice_service.sample_text_for_voice(voice_name)
    temp_dir = utils.storage_dir("temp", create=True)
    audio_file = os.path.join(temp_dir, f"preview-{uuid4()}.mp3")

    sub_maker = voice_service.tts(
        text=text,
        voice_name=voice_name,
        voice_rate=1.0,
        voice_file=audio_file,
        voice_volume=1.0,
    )
    if not sub_maker or not os.path.exists(audio_file):
        # Orijinal içerikle başarısızsa asıl projedeki gibi tek sefer daha dene.
        sub_maker = voice_service.tts(
            text=_FALLBACK_TEXT,
            voice_name=voice_name,
            voice_rate=1.0,
            voice_file=audio_file,
            voice_volume=1.0,
        )

    if not sub_maker or not os.path.exists(audio_file):
        logger.error(f"voice preview synthesis failed for {voice_name}")
        raise HttpException(task_id="", status_code=502, message="voice synthesis failed")

    background_tasks.add_task(_safe_remove, audio_file)
    return FileResponse(audio_file, media_type="audio/mpeg", filename="preview.mp3")


def _safe_remove(path: str) -> None:
    try:
        if os.path.exists(path):
            os.remove(path)
    except OSError as e:
        logger.warning(f"could not remove preview file {path}: {e}")
