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
};

export async function enqueueJob(
  redis: Redis,
  jobId: string,
  params: EngineParams,
): Promise<void> {
  await redis.lpush(
    PENDING_KEY,
    JSON.stringify({ task_id: jobId, params, attempts: 0 }),
  );
}

export async function readEngineState(
  redis: Redis,
  jobId: string,
): Promise<{ state: number; progress: number } | null> {
  const hash = await redis.hgetall(jobId);
  if (!hash || Object.keys(hash).length === 0) return null;
  return { state: Number(hash.state ?? 4), progress: Number(hash.progress ?? 0) };
}
