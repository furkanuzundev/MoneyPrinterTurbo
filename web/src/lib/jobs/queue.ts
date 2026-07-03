import Redis from "ioredis";

// Python worker (worker/queue.py + app/services/state.py RedisState) sözleşmesi:
// kuyruk LPUSH reelate:queue:pending {"task_id","params","attempts"}
// durum HGETALL <task_id> -> state: -1 fail / 1 complete / 4 processing, progress: 0-100
export const PENDING_KEY = "reelate:queue:pending";
export const ENGINE_FAILED = -1;
export const ENGINE_COMPLETE = 1;

let client: Redis | null = null;

export function getRedis(): Redis {
  if (!client) {
    client = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      maxRetriesPerRequest: 2,
    });
  }
  return client;
}

export type EngineParams = {
  video_subject: string;
  video_script: string;
  video_terms: string[];
  video_aspect: string;
  voice_name: string;
  subtitle_enabled: boolean;
  // Sahne bazlı altyazı: varsa worker SRT'yi sahne caption'larından üretir.
  scenes?: { caption: string; voiceover: string }[];
  subtitle_position?: string;
  font_size?: number;
  text_fore_color?: string;
  text_background_color?: boolean | string;
};

export function enqueueSentinelKey(jobId: string): string {
  return `reelate:queue:seen:${jobId}`;
}

export async function enqueueJob(
  redis: Redis,
  jobId: string,
  params: EngineParams,
): Promise<void> {
  // Sentinel, push ile ATOMİK yazılır (MULTI): "kuyruğa hiç ulaşmadı" ile
  // "kuyrukta bekliyor" durumları birbirinden kesin ayrılır; reconciliation
  // yalnızca sentinel YOKSA iade eder.
  await redis
    .multi()
    .lpush(PENDING_KEY, JSON.stringify({ task_id: jobId, params, attempts: 0 }))
    .set(enqueueSentinelKey(jobId), "1", "EX", 7 * 24 * 3600)
    .exec();
}

export async function enqueueRerender(
  redis: Redis,
  jobId: string,
  params: EngineParams,
): Promise<void> {
  // Eski engine hash'i atomik temizlenir: sync, önceki render'ın COMPLETE
  // durumunu görüp işi anında done'a çevirmesin.
  await redis
    .multi()
    .del(jobId)
    .lpush(
      PENDING_KEY,
      JSON.stringify({ task_id: jobId, type: "rerender", params, attempts: 0 }),
    )
    .exec();
}

export async function readEngineState(
  redis: Redis,
  jobId: string,
): Promise<{ state: number; progress: number } | null> {
  const hash = await redis.hgetall(jobId);
  if (!hash || Object.keys(hash).length === 0) return null;
  return { state: Number(hash.state ?? 4), progress: Number(hash.progress ?? 0) };
}
