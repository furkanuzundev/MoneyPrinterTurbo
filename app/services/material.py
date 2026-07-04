import os
import random
import sys
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from typing import List
from urllib.parse import urlencode

import requests
from loguru import logger
from moviepy.video.io.VideoFileClip import VideoFileClip

from app.config import config
from app.models.schema import MaterialInfo, VideoAspect, VideoConcatMode
from app.utils import utils

# Thread-safe counter for API key rotation
_api_key_counter = 0
_api_key_lock = threading.Lock()

# Eviction bu yaştan daha genç dosyalara asla dokunmaz: başka bir worker'ın
# yeni indirdiği veya hâlâ kullanmakta olduğu klipleri silmemek için.
EVICTION_MIN_AGE_SECONDS = 600


def _get_tls_verify() -> bool:
    # 默认开启 TLS 证书校验，防止素材搜索和下载过程被中间人篡改。
    # 仅在企业代理、自签证书等明确需要的场景下，允许用户通过
    # `config.toml` 显式设置 `tls_verify = false` 临时关闭。
    tls_verify = config.app.get("tls_verify", True)
    if isinstance(tls_verify, str):
        tls_verify = tls_verify.strip().lower() not in ("0", "false", "no", "off")

    if not tls_verify:
        logger.warning(
            "TLS certificate verification is disabled by config.app.tls_verify=false. "
            "Only use this in trusted proxy environments."
        )

    return bool(tls_verify)


def get_api_key(cfg_key: str):
    api_keys = config.app.get(cfg_key)
    if not api_keys:
        raise ValueError(
            f"\n\n##### {cfg_key} is not set #####\n\nPlease set it in the config.toml file: {config.config_file}\n\n"
            f"{utils.to_json(config.app)}"
        )

    # if only one key is provided, return it
    if isinstance(api_keys, str):
        return api_keys

    global _api_key_counter
    with _api_key_lock:
        _api_key_counter += 1
        return api_keys[_api_key_counter % len(api_keys)]


def search_videos_pexels(
    search_term: str,
    minimum_duration: int,
    video_aspect: VideoAspect = VideoAspect.portrait,
) -> List[MaterialInfo]:
    aspect = VideoAspect(video_aspect)
    video_orientation = aspect.name
    video_width, video_height = aspect.to_resolution()
    api_key = get_api_key("pexels_api_keys")
    headers = {
        "Authorization": api_key,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
    }
    # Build URL
    params = {"query": search_term, "per_page": 20, "orientation": video_orientation}
    query_url = f"https://api.pexels.com/videos/search?{urlencode(params)}"
    logger.info(f"searching videos: {query_url}, with proxies: {config.proxy}")

    try:
        r = requests.get(
            query_url,
            headers=headers,
            proxies=config.proxy,
            verify=_get_tls_verify(),
            timeout=(30, 60),
        )
        response = r.json()
        video_items = []
        if "videos" not in response:
            logger.error(f"search videos failed: {response}")
            return video_items
        videos = response["videos"]
        # loop through each video in the result
        for v in videos:
            duration = v["duration"]
            # check if video has desired minimum duration
            if duration < minimum_duration:
                continue
            video_files = v["video_files"]
            # loop through each url to determine the best quality
            for video in video_files:
                w = int(video["width"])
                h = int(video["height"])
                if w == video_width and h == video_height:
                    item = MaterialInfo()
                    item.provider = "pexels"
                    item.url = video["link"]
                    item.duration = duration
                    video_items.append(item)
                    break
        return video_items
    except Exception as e:
        logger.error(f"search videos failed: {str(e)}")

    return []


def search_videos_pixabay(
    search_term: str,
    minimum_duration: int,
    video_aspect: VideoAspect = VideoAspect.portrait,
) -> List[MaterialInfo]:
    aspect = VideoAspect(video_aspect)

    video_width, video_height = aspect.to_resolution()

    api_key = get_api_key("pixabay_api_keys")
    # Build URL
    params = {
        "q": search_term,
        "video_type": "all",  # Accepted values: "all", "film", "animation"
        "per_page": 50,
        "key": api_key,
    }
    query_url = f"https://pixabay.com/api/videos/?{urlencode(params)}"
    logger.info(f"searching videos: {query_url}, with proxies: {config.proxy}")

    try:
        r = requests.get(
            query_url, proxies=config.proxy, verify=_get_tls_verify(), timeout=(30, 60)
        )
        response = r.json()
        video_items = []
        if "hits" not in response:
            logger.error(f"search videos failed: {response}")
            return video_items
        videos = response["hits"]
        # loop through each video in the result
        for v in videos:
            duration = v["duration"]
            # check if video has desired minimum duration
            if duration < minimum_duration:
                continue
            video_files = v["videos"]
            # loop through each url to determine the best quality
            for video_type in video_files:
                video = video_files[video_type]
                w = int(video["width"])
                # h = int(video["height"])
                if w >= video_width:
                    item = MaterialInfo()
                    item.provider = "pixabay"
                    item.url = video["url"]
                    item.duration = duration
                    video_items.append(item)
                    break
        return video_items
    except Exception as e:
        logger.error(f"search videos failed: {str(e)}")

    return []


def search_videos_coverr(
    search_term: str,
    minimum_duration: int,
    video_aspect: VideoAspect = VideoAspect.portrait,
) -> List[MaterialInfo]:
    """
    Coverr (https://coverr.co) - free HD/4K stock videos,
    subject to Coverr license terms (https://coverr.co/license).

    Coverr API notes (based on official docs at api.coverr.co/docs/):
      - 鉴权: Authorization: Bearer <api_key>
      - 搜索端点: GET /videos?query=...,响应结构 {"hits": [...], ...}
      - 加 ?urls=true 在搜索响应里直接返回 mp4 直链
      - URL 是 signed JWT(绑定 API key,无过期时间)
      - Coverr 库以 16:9 横屏为主,9:16 portrait 占比极低(约 1%)
        因此本函数不做 aspect_ratio 过滤,由下游 video.py 的
        resize + letterbox 逻辑统一处理
      - duration 字段同时存在 number 和 string 两种形态,本函数都接受

    本函数使用 urls.mp4_download 字段作为下载地址 —— 按 Coverr 官方文档
    (https://api.coverr.co/docs/videos/#download-a-video) 的说法,
    GET 这个 URL 本身就被 Coverr 当作一次合法的 download 事件计入统计,
    无需再调用 PATCH /videos/:id/stats/downloads。
    """
    api_key = get_api_key("coverr_api_keys")
    headers = {"Authorization": f"Bearer {api_key}"}
    params = {
        "query": search_term,
        "page_size": 20,
        "urls": "true",
        "sort": "popular",
    }
    query_url = f"https://api.coverr.co/videos?{urlencode(params)}"
    logger.info(f"searching videos: {query_url}, with proxies: {config.proxy}")

    try:
        r = requests.get(
            query_url,
            headers=headers,
            proxies=config.proxy,
            verify=_get_tls_verify(),
            timeout=(30, 60),
        )
        response = r.json()
        video_items: List[MaterialInfo] = []

        if not isinstance(response, dict) or "hits" not in response:
            logger.error(f"search videos failed: {response}")
            return video_items

        for v in response["hits"]:
            # duration 在不同响应里可能是 number(11.625) 或 string("10.500000")
            try:
                duration = int(float(v.get("duration") or 0))
            except (TypeError, ValueError):
                continue
            if duration < minimum_duration:
                continue

            video_id = v.get("id")
            mp4_download_url = (v.get("urls") or {}).get("mp4_download")
            if not video_id or not mp4_download_url:
                continue

            item = MaterialInfo()
            item.provider = "coverr"
            item.url = mp4_download_url
            item.duration = duration
            video_items.append(item)
        return video_items
    except Exception as e:
        logger.error(f"search videos failed: {str(e)}")

    return []


def _remove_quietly(path: str) -> None:
    try:
        os.remove(path)
    except Exception as remove_error:
        logger.warning(f"failed to remove file: {path}, error: {str(remove_error)}")


def save_video(video_url: str, save_dir: str = "") -> str:
    if not save_dir:
        save_dir = utils.storage_dir("cache_videos")

    if not os.path.exists(save_dir):
        os.makedirs(save_dir)

    url_without_query = video_url.split("?")[0]
    url_hash = utils.md5(url_without_query)
    video_id = f"vid-{url_hash}"
    video_path = f"{save_dir}/{video_id}.mp4"

    # if video already exists, return the path
    if os.path.exists(video_path) and os.path.getsize(video_path) > 0:
        os.utime(video_path, None)  # LRU: isabet eden dosyayı tazele
        logger.info(f"video already exists: {video_path}")
        return video_path

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
    }

    # Aynı URL'yi eşzamanlı indiren iki worker birbirini bozmasın diye önce
    # benzersiz bir temp dosyaya indirilir; doğrulama da temp üzerinde yapılır,
    # sadece geçerliyse os.replace ile final path'e atomik taşınır.
    tmp_path = f"{video_path}.{uuid.uuid4().hex}.part"
    try:
        with open(tmp_path, "wb") as f:
            f.write(
                requests.get(
                    video_url,
                    headers=headers,
                    proxies=config.proxy,
                    verify=_get_tls_verify(),
                    timeout=(60, 240),
                ).content
            )
    except Exception:
        _remove_quietly(tmp_path)
        raise

    # Bu arada başka bir worker aynı videoyu indirip bitirmiş olabilir:
    # kazanan dosya kalır, kendi temp'imizi atarız.
    if os.path.exists(video_path) and os.path.getsize(video_path) > 0:
        _remove_quietly(tmp_path)
        os.utime(video_path, None)
        return video_path

    if os.path.exists(tmp_path) and os.path.getsize(tmp_path) > 0:
        clip = None
        try:
            clip = VideoFileClip(tmp_path)
            duration = clip.duration
            fps = clip.fps
            if duration > 0 and fps > 0:
                os.replace(tmp_path, video_path)
                return video_path
        except Exception as e:
            logger.warning(f"invalid video file: {tmp_path} => {str(e)}")
        finally:
            if clip is not None:
                try:
                    clip.close()
                except Exception as close_error:
                    logger.warning(
                        f"failed to close video clip: {tmp_path}, error: {str(close_error)}"
                    )
    _remove_quietly(tmp_path)
    return ""


def enforce_material_cache_limit(
    cache_dir: str | None = None, max_bytes: int | None = None
) -> int:
    """Önbellek dizinini LRU mantığıyla max_bytes altına indirir."""
    cache_dir = cache_dir or utils.storage_dir("cache_videos")
    if not os.path.isdir(cache_dir):
        return 0
    if max_bytes is None:
        max_gb = float(config.app.get("material_cache_max_gb", 50))
        max_bytes = int(max_gb * 1024**3)
    entries = []
    for name in os.listdir(cache_dir):
        if name.endswith(".part"):
            continue  # indirmesi süren dosyalar eviction taramasına hiç girmez
        path = os.path.join(cache_dir, name)
        if os.path.isfile(path):
            stat = os.stat(path)
            entries.append((stat.st_mtime, stat.st_size, path))
    total = sum(size for _, size, _ in entries)
    removed = 0
    now = time.time()
    for mtime, size, path in sorted(entries):
        if total <= max_bytes:
            break
        if now - mtime < EVICTION_MIN_AGE_SECONDS:
            continue  # yeni indirilen/kullanımdaki klipleri asla silme
        try:
            os.remove(path)
            total -= size
            removed += 1
        except OSError as e:
            logger.warning(f"failed to evict cache file {path}: {str(e)}")
    if removed:
        logger.info(f"evicted {removed} cached clips to enforce cache limit")
    return removed


def _download_candidates_parallel(
    video_items: list,
    save_dir: str,
    needed_duration: float,
    max_clip_duration: int,
    concurrency: int,
) -> List[str]:
    """Adaylari concurrency'lik partiler halinde paralel indirir.

    Parti tamamlaninca toplam sure kontrol edilir; needed_duration asilinca
    kalan adaylar indirilmez. Basarisiz/gecersiz indirmeler atlanir.
    """
    video_paths: List[str] = []
    total_duration = 0.0
    index = 0
    with ThreadPoolExecutor(max_workers=max(1, concurrency)) as pool:
        while index < len(video_items) and total_duration <= needed_duration:
            batch = video_items[index : index + max(1, concurrency)]
            index += len(batch)
            futures = [
                pool.submit(save_video, video_url=item.url, save_dir=save_dir)
                for item in batch
            ]
            for item, future in zip(batch, futures):
                try:
                    saved_video_path = future.result()
                except Exception as e:
                    logger.error(
                        f"failed to download video: {utils.to_json(item)} => {str(e)}"
                    )
                    continue
                if not saved_video_path:
                    continue
                video_paths.append(saved_video_path)
                total_duration += min(max_clip_duration, item.duration)
    return video_paths


# Fonksiyon İSİMLERİ tutulur; çağrı anında bu modülden getattr ile çözülür.
# Böylece testlerin patch.object(material, "search_videos_pexels") yaması
# arama sırasında görünür kalır (statik referans yaması kaçırırdı).
_SOURCE_SEARCH_FUNC_NAMES = {
    "pexels": "search_videos_pexels",
    "pixabay": "search_videos_pixabay",
    "coverr": "search_videos_coverr",
}


def _resolve_search_func(source: str):
    name = _SOURCE_SEARCH_FUNC_NAMES.get(source)
    if name is None:
        return None
    return getattr(sys.modules[__name__], name, None)


_SOURCE_KEY_NAMES = {
    "pexels": "pexels_api_keys",
    "pixabay": "pixabay_api_keys",
    "coverr": "coverr_api_keys",
}


def _configured_sources(preferred: str | None = None) -> List[str]:
    """API key'i yapılandırılmış kaynakları döndürür.

    preferred verilmişse ve yapılandırılmışsa listenin başına alınır.
    Hiçbir kaynak yapılandırılmamışsa preferred'ı (yoksa 'pexels')
    tek elemanlı liste olarak döndürür; gerçek 'key yok' hatası indirme
    anında get_api_key tarafından üretilir.
    """
    ordered = ["pexels", "pixabay", "coverr"]
    if preferred in ordered:
        ordered = [preferred] + [s for s in ordered if s != preferred]

    configured = []
    for src in ordered:
        keys = config.app.get(_SOURCE_KEY_NAMES[src])
        if keys:
            configured.append(src)

    if configured:
        return configured
    return [preferred or "pexels"]


def _merge_sources_round_robin(results_by_source: dict) -> List:
    """Kaynak listelerini round-robin serpiştirir, url bazında tekilleştirir.

    dict ekleme sırası kaynak önceliğini belirler (ör. pexels ilk sırada
    ise her turda önce ondan alınır). Biten kaynak atlanır.
    """
    lists = [items for items in results_by_source.values() if items]
    merged = []
    seen_urls = set()
    index = 0
    while any(index < len(lst) for lst in lists):
        for lst in lists:
            if index >= len(lst):
                continue
            item = lst[index]
            if item.url in seen_urls:
                continue
            seen_urls.add(item.url)
            merged.append(item)
        index += 1
    return merged


def download_videos(
    task_id: str,
    search_terms: List[str],
    source: str = "pexels",
    video_aspect: VideoAspect = VideoAspect.portrait,
    video_concat_mode: VideoConcatMode = VideoConcatMode.random,
    audio_duration: float = 0.0,
    max_clip_duration: int = 5,
    match_script_order: bool = False,
) -> List[str]:
    search_videos = search_videos_pexels
    if source == "pixabay":
        search_videos = search_videos_pixabay
    elif source == "coverr":
        search_videos = search_videos_coverr

    material_directory = config.app.get("material_directory", "").strip()
    if material_directory == "task":
        material_directory = utils.task_dir(task_id)
    elif material_directory and not os.path.isdir(material_directory):
        material_directory = ""

    if match_script_order:
        return _download_videos_by_script_order(
            task_id=task_id,
            search_terms=search_terms,
            search_videos=search_videos,
            video_aspect=video_aspect,
            audio_duration=audio_duration,
            max_clip_duration=max_clip_duration,
            material_directory=material_directory,
        )

    valid_video_items = []
    valid_video_urls = []
    found_duration = 0.0
    for search_term in search_terms:
        video_items = search_videos(
            search_term=search_term,
            minimum_duration=max_clip_duration,
            video_aspect=video_aspect,
        )
        logger.info(f"found {len(video_items)} videos for '{search_term}'")

        for item in video_items:
            if item.url not in valid_video_urls:
                valid_video_items.append(item)
                valid_video_urls.append(item.url)
                found_duration += item.duration

    logger.info(
        f"found total videos: {len(valid_video_items)}, required duration: {audio_duration} seconds, found duration: {found_duration} seconds"
    )
    concat_mode_value = getattr(video_concat_mode, "value", video_concat_mode)
    if concat_mode_value == VideoConcatMode.random.value:
        random.shuffle(valid_video_items)

    concurrency = int(config.app.get("download_concurrency", 4))
    video_paths = _download_candidates_parallel(
        video_items=valid_video_items,
        save_dir=material_directory,
        needed_duration=audio_duration,
        max_clip_duration=max_clip_duration,
        concurrency=concurrency,
    )
    enforce_material_cache_limit()
    logger.success(f"downloaded {len(video_paths)} videos")
    return video_paths


def _download_videos_by_script_order(
    task_id: str,
    search_terms: List[str],
    search_videos,
    video_aspect: VideoAspect,
    audio_duration: float,
    max_clip_duration: int,
    material_directory: str,
) -> List[str]:
    """
    按脚本文案顺序下载素材。

    默认下载逻辑会把所有关键词的候选素材合并成一个大列表；如果第一个
    关键词返回很多结果，最终下载时可能一直消耗这个关键词的素材，后续
    脚本主题就排不上时间线。这里按关键词分组后轮询下载：
    第 1 轮取每个关键词的第 1 个候选，第 2 轮取每个关键词的第 2 个候选。
    这样在不重写视频合成引擎的前提下，尽量保证素材顺序贴近文案顺序。
    """
    logger.info("downloading videos with script-order material matching")
    candidate_groups = []
    valid_video_urls = set()
    found_duration = 0.0

    for search_term in search_terms:
        video_items = search_videos(
            search_term=search_term,
            minimum_duration=max_clip_duration,
            video_aspect=video_aspect,
        )
        logger.info(f"found {len(video_items)} videos for '{search_term}'")

        term_items = []
        for item in video_items:
            if item.url in valid_video_urls:
                continue
            term_items.append(item)
            valid_video_urls.add(item.url)
            found_duration += item.duration

        if term_items:
            candidate_groups.append((search_term, term_items))

    logger.info(
        f"found total ordered video candidates: {sum(len(items) for _, items in candidate_groups)}, "
        f"required duration: {audio_duration} seconds, found duration: {found_duration} seconds"
    )

    video_paths = []
    total_duration = 0.0
    candidate_index = 0
    while candidate_groups and total_duration <= audio_duration:
        has_candidate = False
        for search_term, term_items in candidate_groups:
            if candidate_index >= len(term_items):
                continue

            has_candidate = True
            item = term_items[candidate_index]
            try:
                logger.info(
                    f"downloading ordered video for '{search_term}': {item.url}"
                )
                saved_video_path = save_video(
                    video_url=item.url, save_dir=material_directory
                )
                if saved_video_path:
                    logger.info(f"video saved: {saved_video_path}")
                    video_paths.append(saved_video_path)
                    total_duration += min(max_clip_duration, item.duration)
                    if total_duration > audio_duration:
                        logger.info(
                            f"total duration of downloaded videos: {total_duration} seconds, skip downloading more"
                        )
                        break
            except Exception as e:
                logger.error(
                    f"failed to download ordered video: {utils.to_json(item)} => {str(e)}"
                )

        if not has_candidate:
            break
        candidate_index += 1

    logger.success(f"downloaded {len(video_paths)} ordered videos")
    return video_paths


if __name__ == "__main__":
    download_videos(
        "test123", ["Money Exchange Medium"], audio_duration=100, source="pixabay"
    )
