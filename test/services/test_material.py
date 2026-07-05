import os
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock
from unittest.mock import patch

import requests

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from app.config import config
from app.services import material


class TestMaterialTlsVerification(unittest.TestCase):
    def setUp(self):
        self.original_app_config = dict(config.app)
        self.original_proxy_config = dict(config.proxy)

    def tearDown(self):
        config.app.clear()
        config.app.update(self.original_app_config)
        config.proxy.clear()
        config.proxy.update(self.original_proxy_config)

    def test_search_pexels_uses_tls_verification_by_default(self):
        """
        默认路径必须开启 TLS 校验，避免素材 API key 和返回的素材 URL
        在公共网络或不可信代理环境中被中间人攻击截获或篡改。
        """
        config.app["pexels_api_keys"] = ["pexels-key"]
        config.app.pop("tls_verify", None)
        config.proxy.clear()

        fake_response = SimpleNamespace(
            json=lambda: {
                "videos": [
                    {
                        "duration": 8,
                        "video_files": [
                            {
                                "width": 1080,
                                "height": 1920,
                                "link": "https://example.com/video.mp4",
                            }
                        ],
                    }
                ]
            }
        )

        with patch("app.services.material.requests.get", return_value=fake_response) as get:
            results = material.search_videos_pexels("cat", minimum_duration=1)

        self.assertEqual(len(results), 1)
        self.assertTrue(get.call_args.kwargs["verify"])

    def test_search_pixabay_allows_explicit_tls_disable_for_proxy(self):
        """
        少数企业代理会使用自签证书。该场景必须显式配置关闭 TLS 校验，
        不能再由代码硬编码默认关闭。
        """
        config.app["pixabay_api_keys"] = ["pixabay-key"]
        config.app["tls_verify"] = False
        config.proxy.clear()

        fake_response = SimpleNamespace(
            json=lambda: {
                "hits": [
                    {
                        "duration": 8,
                        "videos": {
                            "large": {
                                "width": 1080,
                                "height": 1920,
                                "url": "https://example.com/video.mp4",
                            }
                        },
                    }
                ]
            }
        )

        with patch("app.services.material.requests.get", return_value=fake_response) as get:
            results = material.search_videos_pixabay("cat", minimum_duration=1)

        self.assertEqual(len(results), 1)
        self.assertFalse(get.call_args.kwargs["verify"])

    def test_save_video_uses_tls_verification_by_default(self):
        config.app.pop("tls_verify", None)
        config.proxy.clear()

        fake_response = SimpleNamespace(content=b"fake-video")

        class FakeVideoFileClip:
            duration = 1
            fps = 24

            def __init__(self, path):
                self.path = path

            def close(self):
                return None

        with tempfile.TemporaryDirectory() as temp_dir:
            with patch(
                "app.services.material.requests.get", return_value=fake_response
            ) as get, patch("app.services.material.VideoFileClip", FakeVideoFileClip):
                video_path = material.save_video(
                    "https://example.com/video.mp4?token=abc", save_dir=temp_dir
                )

            self.assertTrue(os.path.exists(video_path))
            self.assertTrue(get.call_args.kwargs["verify"])

    def test_download_videos_accepts_plain_string_concat_mode(self):
        """
        download_videos 可能被服务层或测试直接传入字符串模式，而不是
        VideoConcatMode 枚举。这里用空搜索词避免真实网络请求，只验证
        字符串 "random" 不会再因为访问 `.value` 抛 AttributeError。
        """
        result = material.download_videos(
            task_id="string-concat-mode",
            search_terms=[],
            video_concat_mode="random",
        )

        self.assertEqual(result, [])

    def test_download_videos_can_round_robin_terms_in_script_order(self):
        """
        开启按文案顺序匹配素材后，不能让第一个关键词的多个候选先把
        音频时长填满。这里模拟两个关键词各有多个候选，验证下载顺序是
        term1-第1个、term2-第1个、term1-第2个，贴近脚本叙事顺序。
        """
        search_results = {
            "opening city": [
                material.MaterialInfo(provider="pexels", url="https://v.example/a1.mp4", duration=3),
                material.MaterialInfo(provider="pexels", url="https://v.example/a2.mp4", duration=3),
            ],
            "middle office": [
                material.MaterialInfo(provider="pexels", url="https://v.example/b1.mp4", duration=3),
                material.MaterialInfo(provider="pexels", url="https://v.example/b2.mp4", duration=3),
            ],
        }
        downloaded_urls = []

        def fake_search(search_term, minimum_duration, video_aspect):
            return search_results[search_term]

        def fake_save_video(video_url, save_dir=""):
            downloaded_urls.append(video_url)
            return f"/tmp/{video_url.rsplit('/', 1)[-1]}"

        with (
            # 只有 pexels 是已配置源:_configured_sources 会混合所有已配置源,
            # 本机 config.toml 里真实的 pixabay/coverr key 不应影响这个只测
            # pexels 顺序轮询的用例(否则会发起真实网络请求并打乱顺序断言)。
            patch.dict(
                config.app,
                {
                    "material_directory": "",
                    "pixabay_api_keys": [],
                    "coverr_api_keys": [],
                },
            ),
            patch.object(material, "search_videos_pexels", side_effect=fake_search),
            patch.object(material, "save_video", side_effect=fake_save_video),
        ):
            result = material.download_videos(
                task_id="ordered-materials",
                search_terms=["opening city", "middle office"],
                source="pexels",
                audio_duration=7,
                max_clip_duration=3,
                match_script_order=True,
            )

        self.assertEqual(
            downloaded_urls,
            [
                "https://v.example/a1.mp4",
                "https://v.example/b1.mp4",
                "https://v.example/a2.mp4",
            ],
        )
        self.assertEqual(result, ["/tmp/a1.mp4", "/tmp/b1.mp4", "/tmp/a2.mp4"])


class TestCoverrProvider(unittest.TestCase):
    """
    Coverr 视频素材源(spec: 2026-06-09-coverr-video-provider-design.md)。
    全部用 unittest.mock 替换 requests，确保 CI 不依赖真实网络和真实 API key。
    """

    def setUp(self):
        self.original_app_config = dict(config.app)
        self.original_proxy_config = dict(config.proxy)

    def tearDown(self):
        config.app.clear()
        config.app.update(self.original_app_config)
        config.proxy.clear()
        config.proxy.update(self.original_proxy_config)

    # ---------------- Tests for search_videos_coverr ----------------

    def test_search_coverr_uses_mp4_download_url(self):
        """
        search_videos_coverr 应把每个 hit 转成 MaterialInfo，并把 urls.mp4_download
        直接作为 MaterialInfo.url。
        按 Coverr 官方文档 (api.coverr.co/docs/videos/#download-a-video),
        GET mp4_download 本身就被 Coverr 计入下载统计,无需额外 PATCH ping。
        同时验证 Authorization header 使用 Bearer scheme。
        """
        config.app["coverr_api_keys"] = ["coverr-key"]
        config.app.pop("tls_verify", None)
        config.proxy.clear()

        fake_response = SimpleNamespace(
            json=lambda: {
                "page": 0,
                "pages": 50,
                "page_size": 20,
                "total": 1,
                "hits": [
                    {
                        "id": "S1YbPl1NfI",
                        "duration": 11.625,
                        "aspect_ratio": "16:9",
                        "urls": {
                            "mp4": "https://storage.coverr.co/videos/abc?token=xyz",
                            "mp4_preview": "https://storage.coverr.co/videos/abc/preview?token=xyz",
                            "mp4_download": "https://storage.coverr.co/videos/abc/download?token=xyz",
                        },
                    }
                ],
            }
        )

        with patch(
            "app.services.material.requests.get", return_value=fake_response
        ) as get:
            results = material.search_videos_coverr("nature", minimum_duration=5)

        self.assertEqual(len(results), 1)
        item = results[0]
        self.assertEqual(item.provider, "coverr")
        self.assertEqual(item.duration, 11)
        # url 字段就是 mp4_download URL,不再做 coverr://id|url 编码
        self.assertEqual(
            item.url, "https://storage.coverr.co/videos/abc/download?token=xyz"
        )
        # Bearer auth + TLS verify on by default
        self.assertEqual(
            get.call_args.kwargs["headers"]["Authorization"], "Bearer coverr-key"
        )
        self.assertTrue(get.call_args.kwargs["verify"])

    def test_search_coverr_uses_tls_verification_by_default(self):
        """与 pexels/pixabay 一致:未显式配置时 TLS 校验默认开启。"""
        config.app["coverr_api_keys"] = ["coverr-key"]
        config.app.pop("tls_verify", None)
        config.proxy.clear()

        fake_response = SimpleNamespace(json=lambda: {"hits": []})

        with patch(
            "app.services.material.requests.get", return_value=fake_response
        ) as get:
            material.search_videos_coverr("nature", minimum_duration=1)

        self.assertTrue(get.call_args.kwargs["verify"])

    def test_search_coverr_allows_explicit_tls_disable_for_proxy(self):
        """企业自签证书代理场景必须能显式关闭 TLS 校验。"""
        config.app["coverr_api_keys"] = ["coverr-key"]
        config.app["tls_verify"] = False
        config.proxy.clear()

        fake_response = SimpleNamespace(json=lambda: {"hits": []})

        with patch(
            "app.services.material.requests.get", return_value=fake_response
        ) as get:
            material.search_videos_coverr("nature", minimum_duration=1)

        self.assertFalse(get.call_args.kwargs["verify"])

    def test_search_coverr_filters_by_min_duration_and_accepts_string(self):
        """
        Coverr duration 字段在不同响应里可能是 number 或 string,
        两种格式都要接受;低于 minimum_duration 的应被过滤。
        """
        config.app["coverr_api_keys"] = ["coverr-key"]
        config.app.pop("tls_verify", None)
        config.proxy.clear()

        fake_response = SimpleNamespace(
            json=lambda: {
                "hits": [
                    {
                        "id": "shortvid",
                        "duration": 3,  # below minimum
                        "urls": {"mp4_download": "https://example.com/a.mp4"},
                    },
                    {
                        "id": "stringdur",
                        "duration": "10.500000",  # string accepted
                        "urls": {"mp4_download": "https://example.com/b.mp4"},
                    },
                ]
            }
        )

        with patch(
            "app.services.material.requests.get", return_value=fake_response
        ):
            results = material.search_videos_coverr("x", minimum_duration=5)

        self.assertEqual(len(results), 1)
        self.assertEqual(results[0].duration, 10)
        self.assertEqual(results[0].url, "https://example.com/b.mp4")

    def test_search_coverr_skips_invalid_items(self):
        """缺 id 或缺 urls.mp4_download 的条目应被跳过,不应抛异常。"""
        config.app["coverr_api_keys"] = ["coverr-key"]
        config.app.pop("tls_verify", None)
        config.proxy.clear()

        fake_response = SimpleNamespace(
            json=lambda: {
                "hits": [
                    {  # missing urls.mp4_download
                        "id": "no-download",
                        "duration": 10,
                        "urls": {"mp4_preview": "https://example.com/preview.mp4"},
                    },
                    {  # missing id
                        "duration": 10,
                        "urls": {"mp4_download": "https://example.com/x.mp4"},
                    },
                    {  # valid baseline
                        "id": "good",
                        "duration": 10,
                        "urls": {"mp4_download": "https://example.com/good.mp4"},
                    },
                ]
            }
        )

        with patch(
            "app.services.material.requests.get", return_value=fake_response
        ):
            results = material.search_videos_coverr("x", minimum_duration=1)

        self.assertEqual(len(results), 1)
        self.assertEqual(results[0].url, "https://example.com/good.mp4")

    def test_search_coverr_returns_empty_on_failure(self):
        """
        响应结构异常 / 网络异常时,函数必须返回 [] 而不是抛异常,
        与 pexels/pixabay 行为保持一致。
        """
        config.app["coverr_api_keys"] = ["coverr-key"]
        config.app.pop("tls_verify", None)
        config.proxy.clear()

        # Subtest A: malformed response (no "hits" key)
        with self.subTest("malformed response"):
            fake_response = SimpleNamespace(
                json=lambda: {"error": "rate limited"}
            )
            with patch(
                "app.services.material.requests.get", return_value=fake_response
            ):
                results = material.search_videos_coverr("x", minimum_duration=1)
            self.assertEqual(results, [])

        # Subtest B: network exception bubbles up from requests.get
        with self.subTest("network exception"):
            with patch(
                "app.services.material.requests.get",
                side_effect=requests.ConnectionError("boom"),
            ):
                results = material.search_videos_coverr("x", minimum_duration=1)
            self.assertEqual(results, [])

    # ---------------- Tests for download_videos coverr branch ----------------

    def test_download_videos_passes_mp4_download_url_to_save_video(self):
        """
        在 source="coverr" 时:
          1. dispatch 到 search_videos_coverr
          2. coverr item 走通用下载路径:save_video 收到的就是 mp4_download URL
             (不再有 coverr://id|url 编码,也不再调用 PATCH ping)
          3. 返回保存路径
        """
        config.app["coverr_api_keys"] = ["coverr-key"]
        # 确保只有 coverr 是已配置的源,不受本机 config.toml 中真实
        # pexels/pixabay key 的影响(_configured_sources 会混合所有已配置源)。
        config.app["pexels_api_keys"] = []
        config.app["pixabay_api_keys"] = []
        config.app.pop("tls_verify", None)
        config.app.pop("material_directory", None)
        config.proxy.clear()

        fake_item = material.MaterialInfo()
        fake_item.provider = "coverr"
        fake_item.url = "https://storage.coverr.co/videos/abc/download?token=xyz"
        fake_item.duration = 10

        with patch(
            "app.services.material.search_videos_coverr",
            return_value=[fake_item],
        ) as search, patch(
            "app.services.material.save_video",
            return_value="/tmp/coverr-saved.mp4",
        ) as save:
            result = material.download_videos(
                task_id="t-coverr",
                search_terms=["nature"],
                source="coverr",
                audio_duration=5,
                max_clip_duration=5,
            )

        # 1. dispatch
        self.assertEqual(search.call_count, 1)

        # 2. save_video 收到的就是 mp4_download URL,原样传入
        save_url = save.call_args.kwargs.get("video_url") or save.call_args.args[0]
        self.assertEqual(
            save_url, "https://storage.coverr.co/videos/abc/download?token=xyz"
        )

        # 3. 返回值正确
        self.assertEqual(result, ["/tmp/coverr-saved.mp4"])


class TestSourceOrientationFiltering(unittest.TestCase):
    """
    9:16 (portrait) seçiliyken yatay klipler timeline'a girip üst-alt boşluk
    (letterbox) yaratıyordu. Pexels API tarafında orientation filtreliyor;
    pixabay ve coverr'ın da istemci tarafında elemesi gerekir.
    """

    def setUp(self):
        self.original_app_config = dict(config.app)
        self.original_proxy_config = dict(config.proxy)
        config.proxy.clear()

    def tearDown(self):
        config.app.clear()
        config.app.update(self.original_app_config)
        config.proxy.clear()
        config.proxy.update(self.original_proxy_config)

    # ---------------- pixabay ----------------

    def _pixabay_response(self):
        return SimpleNamespace(
            json=lambda: {
                "hits": [
                    {  # yatay klip: 1920x1080
                        "duration": 8,
                        "videos": {
                            "large": {
                                "width": 1920,
                                "height": 1080,
                                "url": "https://example.com/landscape.mp4",
                            }
                        },
                    },
                    {  # dikey klip: 1080x1920
                        "duration": 8,
                        "videos": {
                            "large": {
                                "width": 1080,
                                "height": 1920,
                                "url": "https://example.com/portrait.mp4",
                            }
                        },
                    },
                ]
            }
        )

    def test_search_pixabay_excludes_landscape_for_portrait_aspect(self):
        config.app["pixabay_api_keys"] = ["pixabay-key"]
        with patch(
            "app.services.material.requests.get",
            return_value=self._pixabay_response(),
        ):
            results = material.search_videos_pixabay(
                "cat",
                minimum_duration=1,
                video_aspect=material.VideoAspect.portrait,
            )
        self.assertEqual(
            [r.url for r in results], ["https://example.com/portrait.mp4"]
        )

    def test_search_pixabay_excludes_portrait_for_landscape_aspect(self):
        config.app["pixabay_api_keys"] = ["pixabay-key"]
        with patch(
            "app.services.material.requests.get",
            return_value=self._pixabay_response(),
        ):
            results = material.search_videos_pixabay(
                "cat",
                minimum_duration=1,
                video_aspect=material.VideoAspect.landscape,
            )
        self.assertEqual(
            [r.url for r in results], ["https://example.com/landscape.mp4"]
        )

    def test_search_pixabay_picks_matching_rendition_among_mixed(self):
        """
        Aynı hit içinde birden çok rendition varsa yönü tutan ve yeterince
        büyük olanı seçmeli; ilk bakılan rendition yatay diye hit'i
        atlamamalı.
        """
        config.app["pixabay_api_keys"] = ["pixabay-key"]
        fake_response = SimpleNamespace(
            json=lambda: {
                "hits": [
                    {
                        "duration": 8,
                        "videos": {
                            "large": {
                                "width": 1920,
                                "height": 1080,
                                "url": "https://example.com/wrong.mp4",
                            },
                            "medium": {
                                "width": 1080,
                                "height": 1920,
                                "url": "https://example.com/right.mp4",
                            },
                        },
                    }
                ]
            }
        )
        with patch(
            "app.services.material.requests.get", return_value=fake_response
        ):
            results = material.search_videos_pixabay(
                "cat",
                minimum_duration=1,
                video_aspect=material.VideoAspect.portrait,
            )
        self.assertEqual(
            [r.url for r in results], ["https://example.com/right.mp4"]
        )

    # ---------------- coverr ----------------

    def _coverr_response(self):
        return SimpleNamespace(
            json=lambda: {
                "hits": [
                    {  # yatay klip
                        "id": "land",
                        "duration": 10,
                        "is_vertical": False,
                        "max_width": 1920,
                        "max_height": 1080,
                        "urls": {"mp4_download": "https://example.com/land.mp4"},
                    },
                    {  # dikey klip
                        "id": "port",
                        "duration": 10,
                        "is_vertical": True,
                        "max_width": 1080,
                        "max_height": 1920,
                        "urls": {"mp4_download": "https://example.com/port.mp4"},
                    },
                ]
            }
        )

    def test_search_coverr_excludes_landscape_for_portrait_aspect(self):
        config.app["coverr_api_keys"] = ["coverr-key"]
        with patch(
            "app.services.material.requests.get",
            return_value=self._coverr_response(),
        ):
            results = material.search_videos_coverr(
                "nature",
                minimum_duration=5,
                video_aspect=material.VideoAspect.portrait,
            )
        self.assertEqual([r.url for r in results], ["https://example.com/port.mp4"])

    def test_search_coverr_excludes_portrait_for_landscape_aspect(self):
        config.app["coverr_api_keys"] = ["coverr-key"]
        with patch(
            "app.services.material.requests.get",
            return_value=self._coverr_response(),
        ):
            results = material.search_videos_coverr(
                "nature",
                minimum_duration=5,
                video_aspect=material.VideoAspect.landscape,
            )
        self.assertEqual([r.url for r in results], ["https://example.com/land.mp4"])

    def test_search_coverr_falls_back_to_max_dimensions(self):
        """is_vertical yoksa max_width/max_height karşılaştırması kullanılır."""
        config.app["coverr_api_keys"] = ["coverr-key"]
        fake_response = SimpleNamespace(
            json=lambda: {
                "hits": [
                    {
                        "id": "dims-only",
                        "duration": 10,
                        "max_width": 1080,
                        "max_height": 1920,
                        "urls": {"mp4_download": "https://example.com/v.mp4"},
                    }
                ]
            }
        )
        with patch(
            "app.services.material.requests.get", return_value=fake_response
        ):
            results = material.search_videos_coverr(
                "nature",
                minimum_duration=5,
                video_aspect=material.VideoAspect.portrait,
            )
        self.assertEqual([r.url for r in results], ["https://example.com/v.mp4"])

    def test_search_coverr_keeps_items_without_orientation_info(self):
        """
        Yön bilgisi hiç yoksa (eski mock'lar / API değişimi) hit elenmez;
        letterbox'a düşmek, hiç sonuç bulamamaktan iyidir ve gerçek API her
        zaman is_vertical döndürüyor.
        """
        config.app["coverr_api_keys"] = ["coverr-key"]
        fake_response = SimpleNamespace(
            json=lambda: {
                "hits": [
                    {
                        "id": "no-info",
                        "duration": 10,
                        "urls": {"mp4_download": "https://example.com/u.mp4"},
                    }
                ]
            }
        )
        with patch(
            "app.services.material.requests.get", return_value=fake_response
        ):
            results = material.search_videos_coverr(
                "nature",
                minimum_duration=5,
                video_aspect=material.VideoAspect.portrait,
            )
        self.assertEqual([r.url for r in results], ["https://example.com/u.mp4"])


class ConfiguredSourcesTest(unittest.TestCase):
    def test_returns_only_sources_with_nonempty_keys(self):
        fake_cfg = {
            "pexels_api_keys": ["k1"],
            "pixabay_api_keys": [],
            "coverr_api_keys": ["k3"],
        }
        with mock.patch.object(material.config, "app", fake_cfg):
            self.assertEqual(
                material._configured_sources(), ["pexels", "coverr"]
            )

    def test_preferred_source_is_moved_to_front(self):
        fake_cfg = {
            "pexels_api_keys": ["k1"],
            "pixabay_api_keys": ["k2"],
            "coverr_api_keys": [],
        }
        with mock.patch.object(material.config, "app", fake_cfg):
            self.assertEqual(
                material._configured_sources(preferred="pixabay"),
                ["pixabay", "pexels"],
            )

    def test_falls_back_to_preferred_when_none_configured(self):
        fake_cfg = {
            "pexels_api_keys": [],
            "pixabay_api_keys": [],
            "coverr_api_keys": [],
        }
        with mock.patch.object(material.config, "app", fake_cfg):
            self.assertEqual(
                material._configured_sources(preferred="pexels"), ["pexels"]
            )


class MergeSourcesRoundRobinTest(unittest.TestCase):
    def _item(self, url):
        m = material.MaterialInfo()
        m.url = url
        m.duration = 5
        return m

    def test_interleaves_sources_and_skips_exhausted(self):
        by_source = {
            "pexels": [self._item("A1"), self._item("A2"), self._item("A3")],
            "pixabay": [self._item("B1")],
            "coverr": [self._item("C1"), self._item("C2")],
        }
        merged = material._merge_sources_round_robin(by_source)
        self.assertEqual(
            [m.url for m in merged], ["A1", "B1", "C1", "A2", "C2", "A3"]
        )

    def test_deduplicates_by_url_keeping_first(self):
        by_source = {
            "pexels": [self._item("X"), self._item("Y")],
            "pixabay": [self._item("X"), self._item("Z")],
        }
        merged = material._merge_sources_round_robin(by_source)
        self.assertEqual([m.url for m in merged], ["X", "Y", "Z"])

    def test_empty_input_returns_empty(self):
        self.assertEqual(material._merge_sources_round_robin({}), [])


class SearchAllSourcesTest(unittest.TestCase):
    def _item(self, url):
        m = material.MaterialInfo()
        m.url = url
        m.duration = 5
        return m

    def test_merges_results_from_multiple_sources(self):
        with mock.patch.object(
            material, "search_videos_pexels",
            return_value=[self._item("A1"), self._item("A2")],
        ), mock.patch.object(
            material, "search_videos_pixabay",
            return_value=[self._item("B1")],
        ):
            result = material._search_all_sources(
                sources=["pexels", "pixabay"],
                search_term="coffee",
                minimum_duration=5,
                video_aspect=material.VideoAspect.portrait,
            )
        self.assertEqual([m.url for m in result], ["A1", "B1", "A2"])

    def test_source_exception_is_skipped(self):
        with mock.patch.object(
            material, "search_videos_pexels",
            side_effect=RuntimeError("rate limit"),
        ), mock.patch.object(
            material, "search_videos_pixabay",
            return_value=[self._item("B1")],
        ):
            result = material._search_all_sources(
                sources=["pexels", "pixabay"],
                search_term="coffee",
                minimum_duration=5,
                video_aspect=material.VideoAspect.portrait,
            )
        self.assertEqual([m.url for m in result], ["B1"])


class DownloadVideosMultiSourceTest(unittest.TestCase):
    def _item(self, url):
        m = material.MaterialInfo()
        m.url = url
        m.duration = 5
        return m

    def test_normal_path_blends_configured_sources(self):
        fake_cfg = {
            "pexels_api_keys": ["k1"],
            "pixabay_api_keys": ["k2"],
            "coverr_api_keys": [],
            "material_directory": "",
        }
        saved = []
        def fake_save(video_url, save_dir):
            saved.append(video_url)
            return f"/tmp/{video_url}.mp4"

        with mock.patch.object(material.config, "app", fake_cfg), \
             mock.patch.object(material, "search_videos_pexels",
                               return_value=[self._item("A1")]), \
             mock.patch.object(material, "search_videos_pixabay",
                               return_value=[self._item("B1")]), \
             mock.patch.object(material, "save_video", side_effect=fake_save):
            result = material.download_videos(
                task_id="multi",
                search_terms=["coffee"],
                audio_duration=8,
                max_clip_duration=5,
                video_concat_mode="sequential",
            )
        # Her iki kaynaktan da klip indirilmiş olmalı
        self.assertIn("A1", saved)
        self.assertIn("B1", saved)
        self.assertEqual(len(result), 2)


class ScriptOrderMultiSourceTest(unittest.TestCase):
    def _item(self, url):
        m = material.MaterialInfo()
        m.url = url
        m.duration = 5
        return m

    def test_script_order_blends_sources_and_keeps_term_order(self):
        fake_cfg = {
            "pexels_api_keys": ["k1"],
            "pixabay_api_keys": ["k2"],
            "coverr_api_keys": [],
            "material_directory": "",
        }
        # term1 -> pexels A1 + pixabay B1 ; term2 -> pexels A2
        def pexels_search(search_term, minimum_duration, video_aspect):
            return {"t1": [self._item("A1")], "t2": [self._item("A2")]}[search_term]
        def pixabay_search(search_term, minimum_duration, video_aspect):
            return {"t1": [self._item("B1")], "t2": []}[search_term]

        saved = []
        def fake_save(video_url, save_dir):
            saved.append(video_url)
            return f"/tmp/{video_url}.mp4"

        with mock.patch.object(material.config, "app", fake_cfg), \
             mock.patch.object(material, "search_videos_pexels",
                               side_effect=pexels_search), \
             mock.patch.object(material, "search_videos_pixabay",
                               side_effect=pixabay_search), \
             mock.patch.object(material, "save_video", side_effect=fake_save):
            result = material.download_videos(
                task_id="order",
                search_terms=["t1", "t2"],
                audio_duration=20,
                max_clip_duration=5,
                match_script_order=True,
            )
        # İlk tur her terimin 1. adayı: t1->A1, t2->A2 ; sonra t1->B1
        self.assertEqual(saved, ["A1", "A2", "B1"])
        self.assertEqual(len(result), 3)


if __name__ == "__main__":
    unittest.main()
