import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
});

describe("storageBackend", () => {
  it("defaults to local when env unset", async () => {
    vi.stubEnv("STORAGE_BACKEND", "");
    const { storageBackend } = await import("../index");
    expect(storageBackend()).toBe("local");
  });

  it("returns s3 when configured", async () => {
    vi.stubEnv("STORAGE_BACKEND", "s3");
    const { storageBackend } = await import("../index");
    expect(storageBackend()).toBe("s3");
  });
});

describe("presignedGetUrl (s3)", () => {
  it("produces a signed url containing the key", async () => {
    vi.stubEnv("STORAGE_BACKEND", "s3");
    vi.stubEnv("S3_ENDPOINT", "https://fsn1.your-objectstorage.com");
    vi.stubEnv("S3_BUCKET", "reelate");
    vi.stubEnv("S3_REGION", "fsn1");
    vi.stubEnv("S3_ACCESS_KEY", "ak");
    vi.stubEnv("S3_SECRET_KEY", "sk");
    const { presignedGetUrl } = await import("../index");
    const url = await presignedGetUrl("tasks/abc/final-1.mp4");
    expect(url).toContain("tasks/abc/final-1.mp4");
    expect(url).toContain("X-Amz-Signature");
  });

  it("adds attachment disposition when download=true", async () => {
    vi.stubEnv("STORAGE_BACKEND", "s3");
    vi.stubEnv("S3_ENDPOINT", "https://fsn1.your-objectstorage.com");
    vi.stubEnv("S3_BUCKET", "reelate");
    vi.stubEnv("S3_REGION", "fsn1");
    vi.stubEnv("S3_ACCESS_KEY", "ak");
    vi.stubEnv("S3_SECRET_KEY", "sk");
    const { presignedGetUrl } = await import("../index");
    const url = await presignedGetUrl("tasks/abc/final-1.mp4", {
      download: true,
      filename: "reelate-abc.mp4",
    });
    expect(url).toContain("response-content-disposition");
  });
});
