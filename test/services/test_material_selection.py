"""
Stok havuzunu büyütme: oran bazlı rendition seçimi, sayfalı arama ve
esnek minimum klip süresi.

Birebir çözünürlük şartı (1080x1920) dikeyde yatay klip gelmesini
engellemek için konmuştu; aynı korumayı en-boy oranıyla sağlayıp
720x1280 / 2160x3840 gibi aynı orandaki dosyaları da kabul ediyoruz.
"""

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from app.config import config
from app.services import material
from app.models.schema import VideoAspect


class PickRenditionTest(unittest.TestCase):
    def test_portrait_prefers_exact_target_resolution(self):
        url = material._pick_rendition(
            [
                (1920, 1080, "landscape"),
                (2160, 3840, "4k"),
                (1080, 1920, "hd"),
                (720, 1280, "sd"),
            ],
            VideoAspect.portrait,
        )
        self.assertEqual(url, "hd")

    def test_portrait_takes_smallest_above_target_when_no_exact(self):
        url = material._pick_rendition(
            [(2160, 3840, "4k"), (1440, 2560, "2k"), (720, 1280, "sd")],
            VideoAspect.portrait,
        )
        self.assertEqual(url, "2k")

    def test_portrait_accepts_same_ratio_below_target(self):
        url = material._pick_rendition([(720, 1280, "sd")], VideoAspect.portrait)
        self.assertEqual(url, "sd")

    def test_portrait_rejects_other_ratios(self):
        url = material._pick_rendition(
            [(1080, 1350, "4x5"), (1920, 1080, "landscape")], VideoAspect.portrait
        )
        self.assertIsNone(url)

    def test_rejects_too_small_files(self):
        url = material._pick_rendition([(360, 640, "tiny")], VideoAspect.portrait)
        self.assertIsNone(url)

    def test_landscape_rejects_wider_than_16_9(self):
        url = material._pick_rendition(
            [(2048, 1080, "1.9"), (1920, 1080, "hd")], VideoAspect.landscape
        )
        self.assertEqual(url, "hd")

    def test_square_accepts_any_ratio_because_render_crops(self):
        self.assertEqual(
            material._pick_rendition([(1920, 1080, "hd")], VideoAspect.square), "hd"
        )
        self.assertEqual(
            material._pick_rendition([(1080, 1920, "v")], VideoAspect.square), "v"
        )

    def test_ignores_zero_dimensions(self):
        self.assertIsNone(
            material._pick_rendition([(1920, 0, "bad")], VideoAspect.landscape)
        )


class _ConfigIsolation(unittest.TestCase):
    def setUp(self):
        self.original_app_config = dict(config.app)
        self.original_proxy_config = dict(config.proxy)
        config.proxy.clear()

    def tearDown(self):
        config.app.clear()
        config.app.update(self.original_app_config)
        config.proxy.clear()
        config.proxy.update(self.original_proxy_config)


class PexelsSearchTest(_ConfigIsolation):
    def _response(self, files):
        return SimpleNamespace(
            json=lambda: {"videos": [{"duration": 8, "video_files": files}]}
        )

    def test_requests_max_page_size_and_given_page(self):
        config.app["pexels_api_keys"] = ["k"]
        with patch(
            "app.services.material.requests.get", return_value=self._response([])
        ) as get:
            material.search_videos_pexels(
                "cat", minimum_duration=1, video_aspect=VideoAspect.portrait, page=3
            )
        url = get.call_args.args[0]
        self.assertIn("per_page=80", url)
        self.assertIn("page=3", url)
        self.assertIn("orientation=portrait", url)

    def test_square_search_does_not_filter_orientation(self):
        # Pexels'te orientation=square neredeyse hiç sonuç döndürmüyor.
        config.app["pexels_api_keys"] = ["k"]
        with patch(
            "app.services.material.requests.get", return_value=self._response([])
        ) as get:
            material.search_videos_pexels(
                "cat", minimum_duration=1, video_aspect=VideoAspect.square
            )
        self.assertNotIn("orientation", get.call_args.args[0])

    def test_keeps_clip_without_exact_resolution_file(self):
        config.app["pexels_api_keys"] = ["k"]
        response = self._response(
            [
                {"width": 720, "height": 1280, "link": "https://e/sd.mp4"},
                {"width": 2160, "height": 3840, "link": "https://e/4k.mp4"},
            ]
        )
        with patch("app.services.material.requests.get", return_value=response):
            results = material.search_videos_pexels(
                "cat", minimum_duration=1, video_aspect=VideoAspect.portrait
            )
        self.assertEqual([r.url for r in results], ["https://e/4k.mp4"])


class PixabaySearchTest(_ConfigIsolation):
    def test_requests_max_page_size_and_given_page(self):
        config.app["pixabay_api_keys"] = ["k"]
        response = SimpleNamespace(json=lambda: {"hits": []})
        with patch(
            "app.services.material.requests.get", return_value=response
        ) as get:
            material.search_videos_pixabay(
                "cat", minimum_duration=1, video_aspect=VideoAspect.portrait, page=2
            )
        url = get.call_args.args[0]
        self.assertIn("per_page=200", url)
        self.assertIn("page=2", url)

    def test_rejects_non_matching_ratio_with_same_orientation(self):
        config.app["pixabay_api_keys"] = ["k"]
        response = SimpleNamespace(
            json=lambda: {
                "hits": [
                    {
                        "duration": 8,
                        "videos": {
                            "large": {"width": 2048, "height": 1080, "url": "https://e/wide.mp4"}
                        },
                    }
                ]
            }
        )
        with patch("app.services.material.requests.get", return_value=response):
            results = material.search_videos_pixabay(
                "cat", minimum_duration=1, video_aspect=VideoAspect.landscape
            )
        self.assertEqual(results, [])


class CoverrSearchTest(_ConfigIsolation):
    def _response(self, hits):
        return SimpleNamespace(json=lambda: {"hits": hits})

    def _hit(self, hid, w, h):
        return {
            "id": hid,
            "duration": 10,
            "max_width": w,
            "max_height": h,
            "urls": {"mp4_download": f"https://e/{hid}.mp4"},
        }

    def test_requests_max_page_size_and_given_page(self):
        config.app["coverr_api_keys"] = ["k"]
        with patch(
            "app.services.material.requests.get", return_value=self._response([])
        ) as get:
            material.search_videos_coverr(
                "city", minimum_duration=1, video_aspect=VideoAspect.landscape, page=2
            )
        url = get.call_args.args[0]
        self.assertIn("page_size=100", url)
        self.assertIn("page=2", url)

    def test_landscape_rejects_non_16_9_dimensions(self):
        config.app["coverr_api_keys"] = ["k"]
        response = self._response(
            [self._hit("odd", 1280, 768), self._hit("ok", 3840, 2160)]
        )
        with patch("app.services.material.requests.get", return_value=response):
            results = material.search_videos_coverr(
                "city", minimum_duration=1, video_aspect=VideoAspect.landscape
            )
        self.assertEqual([r.url for r in results], ["https://e/ok.mp4"])

    def test_square_accepts_landscape_clips(self):
        config.app["coverr_api_keys"] = ["k"]
        response = self._response([self._hit("land", 1920, 1080)])
        with patch("app.services.material.requests.get", return_value=response):
            results = material.search_videos_coverr(
                "city", minimum_duration=1, video_aspect=VideoAspect.square
            )
        self.assertEqual([r.url for r in results], ["https://e/land.mp4"])


class MinClipDurationTest(_ConfigIsolation):
    def test_defaults_to_three_seconds(self):
        config.app.pop("material_min_clip_duration", None)
        self.assertEqual(material._min_clip_duration(max_clip_duration=5), 3)

    def test_never_exceeds_max_clip_duration(self):
        config.app["material_min_clip_duration"] = 4
        self.assertEqual(material._min_clip_duration(max_clip_duration=2), 2)

    def test_is_configurable(self):
        config.app["material_min_clip_duration"] = 1
        self.assertEqual(material._min_clip_duration(max_clip_duration=5), 1)


def _item(url, duration=5):
    return material.MaterialInfo(provider="pexels", url=url, duration=duration)


class PaginatedDownloadTest(unittest.TestCase):
    def _cfg(self, **extra):
        cfg = {
            "pexels_api_keys": ["k"],
            "pixabay_api_keys": [],
            "coverr_api_keys": [],
            "material_directory": "",
        }
        cfg.update(extra)
        return cfg

    def _run(self, pages, cfg, audio_duration, match_script_order=False):
        calls = []

        def fake_search(search_term, minimum_duration, video_aspect, page=1):
            calls.append((search_term, page, minimum_duration))
            return pages.get((search_term, page), [])

        saved = []

        def fake_save(video_url, save_dir=""):
            saved.append(video_url)
            return f"/tmp/{video_url}"

        with mock.patch.object(material.config, "app", cfg), \
             mock.patch.object(material, "search_videos_pexels", side_effect=fake_search), \
             mock.patch.object(material, "save_video", side_effect=fake_save), \
             mock.patch.object(material, "enforce_material_cache_limit"):
            material.download_videos(
                task_id="paged",
                search_terms=["t1"],
                audio_duration=audio_duration,
                max_clip_duration=5,
                video_concat_mode="sequential",
                match_script_order=match_script_order,
            )
        return calls, saved

    def test_fetches_next_page_when_pool_is_small(self):
        pages = {("t1", 1): [_item("a")], ("t1", 2): [_item("b")]}
        calls, saved = self._run(pages, self._cfg(), audio_duration=8)
        self.assertEqual([c[1] for c in calls], [1, 2, 3])
        self.assertEqual(saved, ["a", "b"])

    def test_stops_when_pool_is_large_enough(self):
        pages = {("t1", 1): [_item(f"a{i}") for i in range(10)]}
        calls, _ = self._run(pages, self._cfg(), audio_duration=8)
        self.assertEqual([c[1] for c in calls], [1])

    def test_respects_max_pages_config(self):
        pages = {("t1", p): [_item(f"p{p}")] for p in range(1, 10)}
        calls, _ = self._run(
            pages, self._cfg(material_search_max_pages=2), audio_duration=100
        )
        self.assertEqual([c[1] for c in calls], [1, 2])

    def test_stops_paging_a_term_once_it_is_exhausted(self):
        pages = {("t1", 1): [_item("a")]}
        calls, _ = self._run(pages, self._cfg(), audio_duration=100)
        self.assertEqual([c[1] for c in calls], [1, 2])

    def test_stops_paging_when_page_brings_nothing_new(self):
        # page parametresini yok sayan bir API kotayı boşa harcatmamalı.
        pages = {("t1", p): [_item("same")] for p in range(1, 10)}
        calls, _ = self._run(pages, self._cfg(), audio_duration=100)
        self.assertEqual([c[1] for c in calls], [1, 2])

    def test_uses_relaxed_minimum_duration(self):
        calls, _ = self._run({}, self._cfg(), audio_duration=8)
        self.assertEqual(calls[0][2], 3)

    def test_script_order_mode_also_pages(self):
        pages = {("t1", 1): [_item("a")], ("t1", 2): [_item("b")]}
        calls, saved = self._run(
            pages, self._cfg(), audio_duration=8, match_script_order=True
        )
        self.assertEqual([c[1] for c in calls], [1, 2, 3])
        self.assertEqual(saved, ["a", "b"])


if __name__ == "__main__":
    unittest.main()
