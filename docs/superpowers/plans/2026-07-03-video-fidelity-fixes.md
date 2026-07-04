# Video Fidelity Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two visible defects in generated videos — subtitles now show the spoken voiceover synced to speech (not caption headings), and stock footage is matched to the script narrative order instead of random.

**Architecture:** Bug 2 is fixed in the Python engine (`app/services/task.py`) by routing scene-mode subtitle generation through the existing word-boundary path (`voice.create_subtitle`, which already syncs SRT to the edge-tts timeline) whenever a `sub_maker` exists, and switching the no-`sub_maker` fallback text from `caption` to `voiceover`. Bug 1 is fixed in the web layer (`web/src/lib/jobs/create.ts`) by adding `match_materials_to_script: true` to the enqueued params, which the engine already interprets as sequential, script-ordered material matching.

**Tech Stack:** Python 3.11 + pytest/unittest (engine), TypeScript + Vitest (web), Redis queue, Postgres.

## Global Constraints

- Python tests use `unittest` + `unittest.mock.patch`; run with `pytest`. Integration-only tests are gated behind `MPT_RUN_INTEGRATION_TESTS` — the tests in this plan are pure unit tests and must NOT require that flag.
- The subtitle text source in ALL code paths must be `voiceover`, never `caption`. `caption` remains a separate on-screen scene-title concept and must not leak into `subtitle.srt`.
- `match_materials_to_script` is always `true` for scene-mode jobs — no user-facing toggle.
- Web enqueue payload shape is `{ task_id, params, attempts }`; params under `payload.params`.
- Scene subtitle timing when no `sub_maker`: proportional by voiceover character share, last scene absorbs remainder (existing behavior — preserve it).

---

### Task 1: Scene-mode fallback subtitle uses voiceover, not caption

Fixes `generate_scene_subtitle` so the proportional fallback (used by `rerender()` and any no-`sub_maker` scene path) writes the spoken `voiceover` text instead of the `caption` heading. This is the smallest independently-testable slice of Bug 2.

**Files:**
- Modify: `app/services/task.py:261` (inside `generate_scene_subtitle`)
- Test: `test/services/test_task.py`

**Interfaces:**
- Consumes: `VideoParams` with `.scenes: List[SceneItem]` where `SceneItem` has `.caption: str` and `.voiceover: str` (see `app/models/schema.py:58-61`); `voice.mktimestamp(int) -> str`.
- Produces: `generate_scene_subtitle(task_id, params, audio_duration) -> str` (path to `subtitle.srt`); unchanged signature, changed SRT text content.

- [ ] **Step 1: Write the failing test**

Add to `test/services/test_task.py` (inside `TestTaskService`):

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest test/services/test_task.py::TestTaskService::test_generate_scene_subtitle_uses_voiceover_not_caption -v`
Expected: FAIL — assertion `"Hazırlık!" not in content` fails (caption currently written).

- [ ] **Step 3: Write minimal implementation**

In `app/services/task.py`, change line 261 from:

```python
        text = (scene.caption or scene.voiceover).strip()
```

to:

```python
        # Altyazı her zaman konuşulan metni gösterir; caption sadece ekran
        # başlığıdır ve SRT'ye sızmamalıdır.
        text = scene.voiceover.strip()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest test/services/test_task.py::TestTaskService::test_generate_scene_subtitle_uses_voiceover_not_caption -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add test/services/test_task.py app/services/task.py
git commit -m "fix(engine): scene subtitle fallback uses voiceover not caption

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Scene-mode subtitles use the synced word-boundary timeline

Routes scene-mode subtitle generation through the existing `generate_subtitle` (word-boundary) path when a `sub_maker` exists, so subtitles follow speech timing instead of coarse proportional scene blocks. Falls back to `generate_scene_subtitle` (now voiceover-based, from Task 1) only when no `sub_maker` is available. This completes Bug 2.

**Files:**
- Modify: `app/services/task.py:488-494` (the `if getattr(params, "scenes", None)` branch inside `start()`)
- Test: `test/services/test_task.py`

**Interfaces:**
- Consumes: `generate_subtitle(task_id, params, video_script, sub_maker, audio_file) -> str` (task.py:188); `generate_scene_subtitle(task_id, params, audio_duration) -> str` (task.py:236). `params.video_script` in scene mode equals the joined voiceovers (guaranteed by `web/src/lib/jobs/create.ts:39-42`).
- Produces: unchanged `start()` control flow; subtitle path assigned to `subtitle_path`.

- [ ] **Step 1: Write the failing test**

Add to `test/services/test_task.py`:

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest test/services/test_task.py -k "scene_mode_prefers or scene_mode_falls_back" -v`
Expected: FAIL — `test_start_scene_mode_prefers_word_boundary_subtitle` fails because current code always calls `generate_scene_subtitle` when scenes exist (`gsub` not called).

- [ ] **Step 3: Write minimal implementation**

In `app/services/task.py`, replace the block at lines 488-494:

```python
    # 4. Generate subtitle
    if getattr(params, "scenes", None):
        subtitle_path = generate_scene_subtitle(task_id, params, audio_duration)
    else:
        subtitle_path = generate_subtitle(
            task_id, params, video_script, sub_maker, audio_file
        )
```

with:

```python
    # 4. Generate subtitle
    # Scene modunda da öncelik kelime-sınır yolundadır: sub_maker (edge-tts
    # zaman çizelgesi) varsa altyazı konuşmayla senkron akar ve metin
    # voiceover'dan gelir (video_script = birleşik voiceover). sub_maker yoksa
    # (özel ses) coarse scene fallback'e düşeriz — o da voiceover metnini yazar.
    if getattr(params, "scenes", None) and sub_maker is None:
        subtitle_path = generate_scene_subtitle(task_id, params, audio_duration)
    else:
        subtitle_path = generate_subtitle(
            task_id, params, video_script, sub_maker, audio_file
        )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest test/services/test_task.py -k "scene_mode_prefers or scene_mode_falls_back" -v`
Expected: PASS (both)

- [ ] **Step 5: Run the full task test module for regressions**

Run: `pytest test/services/test_task.py -v`
Expected: PASS (no regressions)

- [ ] **Step 6: Commit**

```bash
git add test/services/test_task.py app/services/task.py
git commit -m "fix(engine): scene subtitles follow speech via word-boundary timeline

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Enqueue script-ordered material matching for scene jobs

Adds `match_materials_to_script: true` to the enqueued engine params for scene-mode jobs. The engine already turns this single flag into script-ordered term generation, round-robin download, and sequential concat — eliminating the random unrelated-clip behavior (Bug 1).

**Files:**
- Modify: `web/src/lib/jobs/create.ts:85-93` (the `scenes.length > 0` spread in the `enqueueJob` call)
- Test: `web/src/lib/jobs/__tests__/create.test.ts`

**Interfaces:**
- Consumes: `enqueueJob(redis, jobId, params)` — params serialized under `payload.params`; `createVideoJob(db, redis, userId, input)`.
- Produces: enqueued `payload.params.match_materials_to_script === true` when scenes are present.

- [ ] **Step 1: Write the failing test**

Add to `web/src/lib/jobs/__tests__/create.test.ts` inside `describe("createVideoJob", ...)`:

```typescript
it("enables script-ordered material matching for scene jobs", async () => {
  const { jobId } = await createVideoJob(db, redis, userId, {
    ...INPUT,
    script: "",
    scenes: [
      { caption: "Hazırlık!", voiceover: "Malzemeleri hazırlıyoruz." },
      { caption: "Karıştır!", voiceover: "Karıştırıyoruz." },
    ],
  });
  const payload = JSON.parse((await redis.rpop(PENDING_KEY))!);
  expect(payload.task_id).toBe(jobId);
  expect(payload.params.match_materials_to_script).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `web/`): `npx vitest run src/lib/jobs/__tests__/create.test.ts -t "script-ordered material matching"`
Expected: FAIL — `match_materials_to_script` is `undefined`, not `true`.

Note: this suite needs `DATABASE_URL_TEST` (Postgres) and Redis at `redis://localhost:6379/15`. If they are unavailable, start them (docker-compose.dev.yml) before running.

- [ ] **Step 3: Write minimal implementation**

In `web/src/lib/jobs/create.ts`, change the scene spread (currently lines 85-93):

```typescript
      ...(scenes.length > 0
        ? {
            scenes: scenes.map((s) => ({
              caption: s.caption,
              voiceover: s.voiceover,
            })),
            ...engineSubtitleParams(captionStyle ?? DEFAULT_CAPTION_STYLE),
          }
        : {}),
```

to:

```typescript
      ...(scenes.length > 0
        ? {
            scenes: scenes.map((s) => ({
              caption: s.caption,
              voiceover: s.voiceover,
            })),
            // Stok klipleri senaryo anlatı sırasına eşle: motor bu bayrağı
            // sıralı terim üretimi + round-robin indirme + sequential concat
            // olarak yorumlar, böylece alakasız/rastgele klipler engellenir.
            match_materials_to_script: true,
            ...engineSubtitleParams(captionStyle ?? DEFAULT_CAPTION_STYLE),
          }
        : {}),
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `web/`): `npx vitest run src/lib/jobs/__tests__/create.test.ts -t "script-ordered material matching"`
Expected: PASS

- [ ] **Step 5: Run the full create test file for regressions**

Run (from `web/`): `npx vitest run src/lib/jobs/__tests__/create.test.ts`
Expected: PASS (no regressions)

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/jobs/create.ts web/src/lib/jobs/__tests__/create.test.ts
git commit -m "fix(web): match stock footage to script order for scene jobs

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Verification (after all tasks)

End-to-end manual check with a fresh pudding video for `furkanu48@gmail.com`:
1. Generate a new video via the wizard.
2. Confirm `storage/tasks/<id>/subtitle.srt` contains voiceover sentences (e.g. "Malzemeleri hazırlıyoruz...") and NOT caption headings (no "Servis zamanı!", no "Test").
3. Confirm `storage/tasks/<id>/script.json` params show `match_materials_to_script: true`.
4. Watch `final-1.mp4`: subtitles track the spoken words; clips follow the recipe steps in order rather than random unrelated footage.
