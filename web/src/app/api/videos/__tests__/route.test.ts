import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/db", () => ({ db: { select: vi.fn() } }));
vi.mock("@/lib/storage", () => ({
  storageBackend: vi.fn(() => "s3"),
  presignedGetUrl: vi.fn(async () => "https://signed.example/final-1.mp4?X-Amz-Signature=abc"),
}));

import { auth } from "@/auth";
import { db } from "@/db";
import { presignedGetUrl } from "@/lib/storage";
import { GET } from "../[id]/route";

function mockJob(job: unknown) {
  (db.select as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    from: () => ({ where: () => Promise.resolve(job ? [job] : []) }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/videos/[id] (s3)", () => {
  it("401 when unauthenticated", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await GET(new Request("http://x/api/videos/j1"), {
      params: Promise.resolve({ id: "j1" }),
    });
    expect(res.status).toBe(401);
  });

  it("404 when job belongs to another user", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: "u1" } });
    mockJob({ id: "j1", userId: "u2", status: "done", outputPath: "tasks/j1/final-1.mp4" });
    const res = await GET(new Request("http://x/api/videos/j1"), {
      params: Promise.resolve({ id: "j1" }),
    });
    expect(res.status).toBe(404);
  });

  it("307 redirect to presigned url for owner", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: "u1" } });
    mockJob({ id: "j1", userId: "u1", status: "done", outputPath: "tasks/j1/final-1.mp4" });
    const res = await GET(new Request("http://x/api/videos/j1"), {
      params: Promise.resolve({ id: "j1" }),
    });
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("X-Amz-Signature");
    expect(presignedGetUrl).toHaveBeenCalledWith(
      "tasks/j1/final-1.mp4",
      expect.objectContaining({ download: false }),
    );
  });

  it("passes download flag through", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: "u1" } });
    mockJob({ id: "j1", userId: "u1", status: "done", outputPath: "tasks/j1/final-1.mp4" });
    await GET(new Request("http://x/api/videos/j1?download=1"), {
      params: Promise.resolve({ id: "j1" }),
    });
    expect(presignedGetUrl).toHaveBeenCalledWith(
      "tasks/j1/final-1.mp4",
      expect.objectContaining({ download: true }),
    );
  });
});
