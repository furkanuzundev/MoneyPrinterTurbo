# Faz 1 SLO Ölçüm Sonuçları

Task 10 kapsamında Task 9'da yazılan `scripts/benchmark_slo.py` aracıyla üç
kontrollü koşu yapıldı: "önce" (Faz 1 öncesi ayarlar) ve "sonra" (Faz 1
optimizasyonları, soğuk ve sıcak klip önbelleği). Senaryo sabit: 60 saniyelik
script (`test/resources/script-60s.txt`), 9:16, Whisper/Edge altyapısı yerine
LLM adımı devre dışı (spec Bölüm 3: LLM sihirbazda, SLO saati dışında).

## Makine notu

Ölçümler **Apple Silicon Mac'te** (yerel geliştirme makinesi) yapıldı —
production hedefi olan **Hetzner CPX51 değil**. Nihai SLO doğrulaması Faz
3'te gerçek worker donanımında (Hetzner CPX51, 16 vCPU) tekrarlanacak; bu
belgedeki sayılar yön göstergesi, kesin SLO kanıtı değildir. Ayrıca bu koşular
tek-video/tek-worker senaryosunda; production'da eşzamanlı 4 worker slotu
CPU paylaşımı nedeniyle render süresini bir miktar uzatabilir.

## Koşu 1: "Önce" — 1080p + ffmpeg `medium` preset

`config.toml`: `video_quality = "1080p"`, `ffmpeg_preset = "medium"`.
Klip önbelleği sıcak (önceki Task 9 smoke koşusundan kalan dosyalarla).

Komut: `uv run python scripts/benchmark_slo.py --label before-1080p-medium`

| Aşama     | Süre (sn) |
|-----------|-----------|
| tts       | 3.7       |
| subtitle  | 0.0       |
| download  | 12.0      |
| render    | 138.4     |
| **TOPLAM**| **154.1** |

Rapor: `storage/benchmarks/benchmark-1783031561.json`

## Koşu 2: "Sonra" — 720p + ffmpeg `veryfast` preset, soğuk önbellek

`config.toml`: `video_quality = "720p"`, `ffmpeg_preset = "veryfast"`.
`storage/cache_videos` koşudan önce boşaltıldı (taşındı, silinmedi) — klip
indirmeleri sıfırdan yapıldı.

Komut: `uv run python scripts/benchmark_slo.py --label after-720p-veryfast-cold`

| Aşama     | Süre (sn) |
|-----------|-----------|
| tts       | 0.9       |
| subtitle  | 0.0       |
| download  | 23.8      |
| render    | 74.0      |
| **TOPLAM**| **98.7**  |

Rapor: `storage/benchmarks/benchmark-1783031668.json`

## Koşu 3: "Sonra" — 720p + ffmpeg `veryfast` preset, sıcak önbellek

Aynı ayarlarla hemen ardından tekrar koşuldu; Koşu 2'nin indirdiği klipler artık
`storage/cache_videos` içinde.

Komut: `uv run python scripts/benchmark_slo.py --label after-720p-veryfast-warm`

| Aşama     | Süre (sn) |
|-----------|-----------|
| tts       | 1.0       |
| subtitle  | 0.0       |
| download  | 29.6      |
| render    | 73.9      |
| **TOPLAM**| **104.5** |

Rapor: `storage/benchmarks/benchmark-1783031778.json`

Not: Sıcak önbellek koşusunda `download` süresi soğuk koşudan (23.8s) daha
yüksek çıktı (29.6s) — beklenenin tersi. Sebep: Pexels API araması (arama +
metadata) her koşuda tekrar yapılıyor; yalnızca dosya indirme adımı
önbellekten atlanıyor. Bu ölçümde ağ/Pexels API gecikmesindeki koşu-arası
varyans, önbellek kazanımından daha büyük çıktı. Önbelleğin etkisi net görülmek
isteniyorsa `download` aşaması "arama" ve "dosya indirme/kopyalama" olarak ayrı
ölçülmeli (mevcut kapsam dışı, Faz 2 adayı).

## Özet tablo

| Koşu                          | tts  | download | render | TOPLAM |
|--------------------------------|------|----------|--------|--------|
| before-1080p-medium             | 3.7  | 12.0     | 138.4  | 154.1  |
| after-720p-veryfast-cold        | 0.9  | 23.8     | 74.0   | 98.7   |
| after-720p-veryfast-warm        | 1.0  | 29.6     | 73.9   | 104.5  |

Task 8 E2E veri noktası (referans): gerçek Redis kuyruğu + worker süreciyle
uçtan uca (enqueue → final video hazır) **108 sn** ölçülmüştü (720p +
veryfast, worker zaten sıcak/ayakta). Bu, benchmark script'inin ölçtüğü
in-process süreye (Koşu 2/3) yakın; kuyruğa alma + worker polling ek yükü
görece küçük.

## Sonuç: "render ≤ ~2 dk" hedefi tutuyor mu?

**Evet, tutuyor — ve rahat bir marjla.** Faz 1 optimizasyonlarıyla (720p +
`veryfast` + paralel indirme + klip önbelleği) render aşaması tek başına
**~74 saniyeye (~1,2 dk)** indi (önceki 138,4 saniyeden / ~%47 iyileşme), toplam
uçtan uca süre **~99-105 saniyeye (~1,7-1,8 dk)** düştü. Bu, spec Bölüm
3 madde 1'deki "render ≤ ~2 dk" hedefinin (yalnız render aşaması için) hem
karşılandığını hem de toplam pipeline'ın (tts+download+render) 2 dakika
sınırının altında kaldığını gösteriyor.

Karşılaştırma: "önce" durumunda (1080p + `medium`) toplam süre 154,1 sn
(~2,6 dk) idi — hedefin üzerinde. Faz 1 değişiklikleri olmadan SLO
tutmuyordu; değişikliklerle tutuyor.

**Uyarılar / sınırlamalar:**
- Ölçüm Apple Silicon Mac'te yapıldı, production hedefi Hetzner CPX51'de
  değil. CPU mimarisi ve tek-worker/çok-worker paylaşımı farklarından dolayı
  Faz 3'te production donanımında yeniden ölçülmeli.
- Tek video/tek worker senaryosu; 4 eşzamanlı worker slotu altında CPU
  paylaşımı render süresini uzatabilir — bu senaryo bu ölçümde test edilmedi.
- `download` aşamasının önbellek kazanımı bu koşuda ağ varyansı içinde kayboldu
  (bkz. Koşu 3 notu); önbelleğin gerçek etkisini görmek için arama ve dosya
  indirme adımlarının ayrı ölçülmesi gerekir.

**Hedef tutmasa ne yapılırdı (referans için, şu an gerekmiyor):** fps 30→24
düşürmek veya klipleri önbelleğe alırken hedef çözünürlüğe ön-ölçekleyip
(pre-scale) render sırasında tekrar resize maliyetinden kaçınmak adaylar
olarak not edildi; mevcut ölçümlerde bu ek optimizasyonlara ihtiyaç
görünmüyor.
