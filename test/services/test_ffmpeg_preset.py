from app.services import video as video_svc


class FakeClip:
    def __init__(self):
        self.kwargs = None

    def write_videofile(self, output_file, **kwargs):
        self.kwargs = kwargs


def test_preset_added_for_libx264(monkeypatch):
    monkeypatch.setattr(video_svc.config, "app", {})
    monkeypatch.setattr(video_svc, "_get_effective_video_codec", lambda c: "libx264")
    clip = FakeClip()
    video_svc._write_videofile_with_codec_fallback(clip, "/tmp/out.mp4", codec="libx264")
    assert clip.kwargs["preset"] == "veryfast"


def test_preset_configurable(monkeypatch):
    monkeypatch.setattr(video_svc.config, "app", {"ffmpeg_preset": "ultrafast"})
    monkeypatch.setattr(video_svc, "_get_effective_video_codec", lambda c: "libx264")
    clip = FakeClip()
    video_svc._write_videofile_with_codec_fallback(clip, "/tmp/out.mp4", codec="libx264")
    assert clip.kwargs["preset"] == "ultrafast"


def test_preset_skipped_for_hw_encoder(monkeypatch):
    monkeypatch.setattr(video_svc.config, "app", {})
    monkeypatch.setattr(
        video_svc, "_get_effective_video_codec", lambda c: "h264_videotoolbox"
    )
    clip = FakeClip()
    video_svc._write_videofile_with_codec_fallback(
        clip, "/tmp/out.mp4", codec="h264_videotoolbox"
    )
    assert "preset" not in clip.kwargs


def test_concat_command_includes_preset_for_libx264(monkeypatch):
    monkeypatch.setattr(video_svc.config, "app", {})
    cmd = video_svc._build_concat_command("libx264", "/tmp/list.txt", "/tmp/o.mp4", 2)
    i = cmd.index("-preset")
    assert cmd[i + 1] == "veryfast"


def test_concat_command_skips_preset_for_hw_encoder(monkeypatch):
    monkeypatch.setattr(video_svc.config, "app", {})
    cmd = video_svc._build_concat_command(
        "h264_videotoolbox", "/tmp/list.txt", "/tmp/o.mp4", 2
    )
    assert "-preset" not in cmd
