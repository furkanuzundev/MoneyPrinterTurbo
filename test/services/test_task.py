import unittest
import os
import shutil
import sys
import tempfile
from pathlib import Path
from unittest.mock import patch

# add project root to python path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from app.services import task as tm
from app.models.schema import MaterialInfo, VideoParams
from app.utils import utils

resources_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "resources")
RUN_INTEGRATION_TESTS = os.environ.get("MPT_RUN_INTEGRATION_TESTS", "").lower() in {
    "1",
    "true",
    "yes",
}

class TestTaskService(unittest.TestCase):
    def setUp(self):
        pass
    
    def tearDown(self):
        pass

    def test_generate_script_forwards_advanced_prompt_options(self):
        """
        任务生成入口和 WebUI/API 共用 VideoParams。这里验证自动生成文案时，
        高级提示词参数会继续传到 LLM 服务层，避免只在 /scripts 接口生效。
        """
        params = VideoParams(
            video_subject="咖啡",
            video_script="",
            video_language="zh-CN",
            paragraph_number=2,
            video_script_prompt="语气轻松",
            custom_system_prompt="Only write short narration.",
        )

        with patch.object(tm.llm, "generate_script", return_value="生成的文案") as generate:
            result = tm.generate_script("task-id", params)

        self.assertEqual(result, "生成的文案")
        generate.assert_called_once_with(
            video_subject="咖啡",
            language="zh-CN",
            paragraph_number=2,
            video_script_prompt="语气轻松",
            custom_system_prompt="Only write short narration.",
        )

    def test_generate_terms_uses_script_order_mode_when_enabled(self):
        """
        默认模式不受影响；只有用户显式开启素材按文案顺序匹配时，任务层才
        要求 LLM 生成有序关键词，并适当增加关键词数量以覆盖更多脚本片段。
        """
        params = VideoParams(
            video_subject="城市通勤",
            video_script="",
            match_materials_to_script=True,
        )

        with patch.object(tm.llm, "generate_terms", return_value=["city", "train"]) as generate:
            result = tm.generate_terms("task-id", params, "先城市，再地铁")

        self.assertEqual(result, ["city", "train"])
        generate.assert_called_once_with(
            video_subject="城市通勤",
            video_script="先城市，再地铁",
            amount=8,
            match_script_order=True,
        )
    
    def test_generate_audio_uses_custom_file_inside_task_directory(self):
        task_id = "test-custom-audio-safe"
        task_dir = utils.task_dir(task_id)
        custom_audio_file = os.path.join(task_dir, "custom-audio.mp3")
        with open(custom_audio_file, "wb") as audio:
            audio.write(b"fake audio")

        params = VideoParams(
            video_subject="custom audio",
            video_script="",
            custom_audio_file=custom_audio_file,
            voice_name="test-voice",
        )

        try:
            with (
                patch.object(tm.voice, "tts") as tts,
                patch.object(tm.voice, "get_audio_duration", return_value=7),
            ):
                audio_file, audio_duration, sub_maker = tm.generate_audio(
                    task_id, params, "script"
                )
        finally:
            shutil.rmtree(task_dir, ignore_errors=True)

        self.assertEqual(audio_file, os.path.realpath(custom_audio_file))
        self.assertEqual(audio_duration, 7)
        self.assertIsNone(sub_maker)
        tts.assert_not_called()

    def test_generate_audio_accepts_server_side_custom_file(self):
        task_id = "test-custom-audio-server-side"
        task_dir = utils.task_dir(task_id)

        with tempfile.NamedTemporaryFile(suffix=".mp3") as server_audio:
            server_audio.write(b"fake audio")
            server_audio.flush()
            params = VideoParams(
                video_subject="custom audio",
                video_script="",
                custom_audio_file=server_audio.name,
                voice_name="test-voice",
            )

            try:
                with (
                    patch.object(tm.voice, "tts") as tts,
                    patch.object(tm.voice, "get_audio_duration", return_value=6),
                ):
                    audio_file, audio_duration, result_sub_maker = tm.generate_audio(
                        task_id, params, "script"
                    )
            finally:
                shutil.rmtree(task_dir, ignore_errors=True)

        self.assertEqual(audio_file, os.path.realpath(server_audio.name))
        self.assertEqual(audio_duration, 6)
        self.assertIsNone(result_sub_maker)
        tts.assert_not_called()

    def test_generate_audio_rejects_missing_custom_file_without_tts(self):
        task_id = "test-custom-audio-missing"
        task_dir = utils.task_dir(task_id)
        missing_audio_file = os.path.join(task_dir, "missing.mp3")
        params = VideoParams(
            video_subject="custom audio",
            video_script="",
            custom_audio_file=missing_audio_file,
            voice_name="test-voice",
        )

        try:
            with (
                patch.object(tm.voice, "tts") as tts,
                patch.object(tm.sm.state, "update_task") as update_task,
            ):
                audio_file, audio_duration, result_sub_maker = tm.generate_audio(
                    task_id, params, "script"
                )
        finally:
            shutil.rmtree(task_dir, ignore_errors=True)

        self.assertIsNone(audio_file)
        self.assertIsNone(audio_duration)
        self.assertIsNone(result_sub_maker)
        tts.assert_not_called()
        update_task.assert_called_with(task_id, state=tm.const.TASK_STATE_FAILED)

    def test_generate_subtitle_uses_whisper_for_custom_audio_without_sub_maker(self):
        """
        自定义音频不会经过 TTS，所以没有 sub_maker。
        Whisper 可以直接从音频文件转写，此时不能被 sub_maker 为空的保护逻辑提前跳过。
        """
        task_id = "test-custom-audio-whisper-subtitle"
        task_dir = utils.task_dir(task_id)
        audio_file = os.path.join(task_dir, "custom-audio.mp3")
        Path(audio_file).write_bytes(b"fake audio")
        params = VideoParams(
            video_subject="custom audio",
            video_script="Hello world.",
            subtitle_enabled=True,
        )

        def fake_whisper_create(audio_file, subtitle_file):
            Path(subtitle_file).write_text(
                "1\n00:00:00,000 --> 00:00:01,000\nHello world.\n\n",
                encoding="utf-8",
            )

        try:
            with (
                patch.object(
                    tm.config,
                    "app",
                    dict(tm.config.app, subtitle_provider="whisper"),
                ),
                patch.object(
                    tm.subtitle, "create", side_effect=fake_whisper_create
                ) as create,
                patch.object(tm.subtitle, "correct") as correct,
            ):
                subtitle_path = tm.generate_subtitle(
                    task_id=task_id,
                    params=params,
                    video_script="Hello world.",
                    sub_maker=None,
                    audio_file=audio_file,
                )
        finally:
            shutil.rmtree(task_dir, ignore_errors=True)

        self.assertTrue(subtitle_path.endswith("subtitle.srt"))
        create.assert_called_once_with(audio_file=audio_file, subtitle_file=subtitle_path)
        correct.assert_called_once_with(
            subtitle_file=subtitle_path, video_script="Hello world."
        )

    def test_generate_subtitle_skips_edge_provider_without_sub_maker(self):
        """
        Edge 字幕依赖 TTS 返回的 sub_maker 时间轴。
        自定义音频缺少该对象时应继续跳过，避免产生不可信的字幕时间轴。
        """
        task_id = "test-custom-audio-edge-no-submaker"
        task_dir = utils.task_dir(task_id)
        audio_file = os.path.join(task_dir, "custom-audio.mp3")
        Path(audio_file).write_bytes(b"fake audio")
        params = VideoParams(
            video_subject="custom audio",
            video_script="Hello world.",
            subtitle_enabled=True,
        )

        try:
            with (
                patch.object(
                    tm.config,
                    "app",
                    dict(tm.config.app, subtitle_provider="edge"),
                ),
                patch.object(tm.voice, "create_subtitle") as create_subtitle,
                patch.object(tm.subtitle, "create") as whisper_create,
            ):
                subtitle_path = tm.generate_subtitle(
                    task_id=task_id,
                    params=params,
                    video_script="Hello world.",
                    sub_maker=None,
                    audio_file=audio_file,
                )
        finally:
            shutil.rmtree(task_dir, ignore_errors=True)

        self.assertEqual(subtitle_path, "")
        create_subtitle.assert_not_called()
        whisper_create.assert_not_called()

    def test_generate_scene_subtitle_uses_voiceover_not_caption(self):
        """
        Sahne modu fallback altyazısı (sub_maker yok) konuşulan voiceover
        metnini yazmalı — ekrandaki caption başlığını değil.
        """
        from app.models.schema import SceneItem

        tmp = tempfile.mkdtemp()
        try:
            params = VideoParams(
                video_subject="puding",
                video_script="Malzemeleri hazırlıyoruz. Karıştırıyoruz.",
                subtitle_enabled=True,
                scenes=[
                    SceneItem(caption="Hazırlık!", voiceover="Malzemeleri hazırlıyoruz."),
                    SceneItem(caption="Karıştır!", voiceover="Karıştırıyoruz."),
                ],
            )
            with patch.object(tm.utils, "task_dir", return_value=tmp):
                srt_path = tm.generate_scene_subtitle("t1", params, audio_duration=6.0)

            with open(srt_path, encoding="utf-8") as f:
                content = f.read()

            self.assertIn("Malzemeleri hazırlıyoruz.", content)
            self.assertIn("Karıştırıyoruz.", content)
            self.assertNotIn("Hazırlık!", content)
            self.assertNotIn("Karıştır!", content)
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    @unittest.skipUnless(
        RUN_INTEGRATION_TESTS,
        "MPT_RUN_INTEGRATION_TESTS not set",
    )
    def test_task_local_materials(self):
        task_id = "00000000-0000-0000-0000-000000000000"
        video_materials=[]
        for i in range(1, 4):
            video_materials.append(MaterialInfo(
                provider="local",
                url=os.path.join(resources_dir, f"{i}.png"),
                duration=0
            ))

        params = VideoParams(
            video_subject="金钱的作用",
            video_script="金钱不仅是交换媒介，更是社会资源的分配工具。它能满足基本生存需求，如食物和住房，也能提供教育、医疗等提升生活品质的机会。拥有足够的金钱意味着更多选择权，比如职业自由或创业可能。但金钱的作用也有边界，它无法直接购买幸福、健康或真诚的人际关系。过度追逐财富可能导致价值观扭曲，忽视精神层面的需求。理想的状态是理性看待金钱，将其作为实现目标的工具而非终极目的。",
            video_terms="money importance, wealth and society, financial freedom, money and happiness, role of money",
            video_aspect="9:16",
            video_concat_mode="random",
            video_transition_mode="None",
            video_clip_duration=3,
            video_count=1,
            video_source="local",
            video_materials=video_materials,
            video_language="",
            voice_name="zh-CN-XiaoxiaoNeural-Female",
            voice_volume=1.0,
            voice_rate=1.0,
            bgm_type="random",
            bgm_file="",
            bgm_volume=0.2,
            subtitle_enabled=True,
            subtitle_position="bottom",
            custom_position=70.0,
            font_name="MicrosoftYaHeiBold.ttc",
            text_fore_color="#FFFFFF",
            text_background_color=True,
            font_size=60,
            stroke_color="#000000",
            stroke_width=1.5,
            n_threads=2,
            paragraph_number=1
        )
        result = tm.start(task_id=task_id, params=params)
        print(result)

    def test_start_scene_mode_prefers_word_boundary_subtitle(self):
        """
        Scene modunda sub_maker mevcutsa, altyazı kelime-sınır yolundan
        (generate_subtitle) üretilmeli; coarse scene fallback kullanılmamalı.
        """
        from app.models.schema import SceneItem

        params = VideoParams(
            video_subject="puding",
            video_script="Malzemeleri hazırlıyoruz. Karıştırıyoruz.",
            subtitle_enabled=True,
            video_source="local",
            scenes=[
                SceneItem(caption="Hazırlık!", voiceover="Malzemeleri hazırlıyoruz."),
                SceneItem(caption="Karıştır!", voiceover="Karıştırıyoruz."),
            ],
        )

        sentinel_sub_maker = object()

        with patch.object(tm, "generate_script", return_value=params.video_script), \
             patch.object(tm, "generate_audio",
                          return_value=("audio.mp3", 6, sentinel_sub_maker)), \
             patch.object(tm, "generate_subtitle", return_value="word.srt") as gsub, \
             patch.object(tm, "generate_scene_subtitle", return_value="scene.srt") as gscene:
            result = tm.start("t2", params, stop_at="subtitle")

        gsub.assert_called_once()
        gscene.assert_not_called()
        self.assertEqual(result["subtitle_path"], "word.srt")

    def test_start_scene_mode_falls_back_when_no_sub_maker(self):
        """
        sub_maker yoksa (özel ses) scene fallback devreye girer.
        """
        from app.models.schema import SceneItem

        params = VideoParams(
            video_subject="puding",
            video_script="Malzemeleri hazırlıyoruz.",
            subtitle_enabled=True,
            video_source="local",
            scenes=[SceneItem(caption="Hazırlık!", voiceover="Malzemeleri hazırlıyoruz.")],
        )

        with patch.object(tm, "generate_script", return_value=params.video_script), \
             patch.object(tm, "generate_audio",
                          return_value=("audio.mp3", 6, None)), \
             patch.object(tm, "generate_subtitle", return_value="word.srt") as gsub, \
             patch.object(tm, "generate_scene_subtitle", return_value="scene.srt") as gscene:
            result = tm.start("t3", params, stop_at="subtitle")

        gscene.assert_called_once()
        gsub.assert_not_called()
        self.assertEqual(result["subtitle_path"], "scene.srt")

    def test_start_uploads_outputs_to_storage(self):
        """Render bitince final/combined/audio bucket'a put edilmeli."""
        params = VideoParams(video_subject="x", video_script="bir cümle.", video_source="local")
        put_calls = []

        class FakeStorage:
            def put(self, local, key):
                put_calls.append(key)

        with patch.object(tm, "generate_script", return_value="bir cümle."), \
             patch.object(tm, "generate_terms", return_value="x"), \
             patch.object(tm, "save_script_data"), \
             patch.object(tm, "generate_audio", return_value=("audio.mp3", 3.0, object())), \
             patch.object(tm, "generate_subtitle", return_value="sub.srt"), \
             patch.object(tm, "get_video_materials", return_value=["m.mp4"]), \
             patch.object(tm, "generate_final_videos",
                          return_value=(["/t/tasks/id/final-1.mp4"], ["/t/tasks/id/combined-1.mp4"])), \
             patch.object(tm.sto, "get_storage", return_value=FakeStorage()), \
             patch.object(tm.sm.state, "update_task"):
            tm.start("id", params)

        self.assertIn("tasks/id/final-1.mp4", put_calls)
        self.assertIn("tasks/id/combined-1.mp4", put_calls)
        self.assertIn("tasks/id/audio.mp3", put_calls)

    def test_rerender_downloads_sources_and_uploads_final(self):
        params = VideoParams(video_subject="x", video_script="c.")
        got, put = [], []
        task_dir = utils.task_dir("rid")

        class FakeStorage:
            def exists(self, key):
                return True
            def get(self, key, local):
                got.append(key)
                # indirme simülasyonu: hedef dosyayı oluştur
                os.makedirs(os.path.dirname(local), exist_ok=True)
                with open(local, "w") as f:
                    f.write("x")
            def put(self, local, key):
                put.append(key)

        def fake_generate(**kwargs):
            with open(kwargs["output_file"], "w") as f:
                f.write("v")

        try:
            with patch.object(tm.sto, "get_storage", return_value=FakeStorage()), \
                 patch.object(tm.voice, "get_audio_duration", return_value=3.0), \
                 patch.object(tm, "generate_scene_subtitle", return_value="sub.srt"), \
                 patch.object(tm.video, "generate_video", side_effect=fake_generate), \
                 patch.object(tm.sm.state, "update_task"):
                result = tm.rerender("rid", params)

            self.assertIn("tasks/rid/combined-1.mp4", got)
            self.assertIn("tasks/rid/audio.mp3", got)
            self.assertIn("tasks/rid/final-1.mp4", put)
            self.assertTrue(result["videos"][0].endswith("final-1.mp4"))
        finally:
            shutil.rmtree(task_dir, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
