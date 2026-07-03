import Redis from "ioredis";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  ENGINE_COMPLETE,
  ENGINE_FAILED,
  enqueueJob,
  PENDING_KEY,
  readEngineState,
} from "../queue";

const redis = new Redis("redis://localhost:6379/15");

beforeEach(() => redis.flushdb());
afterAll(() => redis.quit());

const PARAMS = {
  video_subject: "morning habits",
  video_script: "drink water",
  video_terms: ["morning", "coffee"],
  video_aspect: "9:16",
  voice_name: "en-US-JennyNeural-Female",
  subtitle_enabled: true,
};

describe("enqueueJob", () => {
  it("pushes worker-compatible payload", async () => {
    await enqueueJob(redis, "job-1", PARAMS);
    const raw = await redis.rpop(PENDING_KEY);
    expect(JSON.parse(raw!)).toEqual({
      task_id: "job-1",
      params: PARAMS,
      attempts: 0,
    });
  });
});

describe("readEngineState", () => {
  it("returns null when worker has not touched the job", async () => {
    expect(await readEngineState(redis, "job-x")).toBeNull();
  });
  it("parses processing state", async () => {
    await redis.hset("job-1", { state: "4", progress: "42" });
    expect(await readEngineState(redis, "job-1")).toEqual({ state: 4, progress: 42 });
  });
  it("parses terminal states", async () => {
    await redis.hset("job-2", { state: String(ENGINE_COMPLETE), progress: "100" });
    expect((await readEngineState(redis, "job-2"))!.state).toBe(1);
    await redis.hset("job-3", { state: String(ENGINE_FAILED), progress: "0" });
    expect((await readEngineState(redis, "job-3"))!.state).toBe(-1);
  });
});
