import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/lib/admin/session", () => ({
  ADMIN_COOKIE: "admin_session",
  verifySessionToken: vi.fn(),
}));
vi.mock("@/db", () => ({ db: { select: vi.fn() } }));
vi.mock("@/lib/storage", () => ({
  storageBackend: vi.fn(() => "s3"),
  presignedGetUrl: vi.fn(async () => "https://signed.example/final-1.mp4?X-Amz-Signature=abc"),
}));

import { cookies } from "next/headers";
import { db } from "@/db";
import { verifySessionToken } from "@/lib/admin/session";
import { presignedGetUrl } from "@/lib/storage";
import { GET } from "../[id]/route";

function mockJob(job: unknown) {
  (db.select as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    from: () => ({ where: () => Promise.resolve(job ? [job] : []) }),
  });
}

function call(url = "http://x/videos/j1") {
  return GET(new Request(url), { params: Promise.resolve({ id: "j1" }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  (cookies as ReturnType<typeof vi.fn>).mockResolvedValue({
    get: () => ({ value: "token" }),
  });
});

describe("GET admin /videos/[id]", () => {
  it("401 without a valid admin session", async () => {
    (verifySessionToken as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    mockJob({ id: "j1", userId: "u2", status: "done", outputPath: "tasks/j1/final-1.mp4" });
    const res = await call();
    expect(res.status).toBe(401);
    expect(presignedGetUrl).not.toHaveBeenCalled();
  });

  it("serves any user's finished video to the admin", async () => {
    (verifySessionToken as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    mockJob({ id: "j1", userId: "u2", status: "done", outputPath: "tasks/j1/final-1.mp4" });
    const res = await call();
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("X-Amz-Signature");
    expect(presignedGetUrl).toHaveBeenCalledWith(
      "tasks/j1/final-1.mp4",
      expect.objectContaining({ download: false }),
    );
  });

  it("409 when the job is not finished", async () => {
    (verifySessionToken as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    mockJob({ id: "j1", userId: "u2", status: "rendering", outputPath: null });
    const res = await call();
    expect(res.status).toBe(409);
  });

  it("404 when the job does not exist", async () => {
    (verifySessionToken as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    mockJob(null);
    const res = await call();
    expect(res.status).toBe(404);
  });
});
