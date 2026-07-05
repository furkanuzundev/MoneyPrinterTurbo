import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/db", () => ({ db: { select: vi.fn(), delete: vi.fn() } }));
vi.mock("@/lib/jobs/queue", () => ({
  enqueueSentinelKey: (id: string) => `s:${id}`,
  getRedis: () => ({ del: vi.fn() }),
}));
vi.mock("@/lib/storage", () => ({
  storageBackend: vi.fn(() => "s3"),
  deleteTaskPrefix: vi.fn(async () => {}),
}));

import { auth } from "@/auth";
import { db } from "@/db";
import { deleteTaskPrefix } from "@/lib/storage";
import { DELETE } from "../[id]/route";

beforeEach(() => {
  vi.clearAllMocks();
  (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
    from: () => ({
      where: () =>
        Promise.resolve([{ id: "j1", userId: "u1", status: "done" }]),
    }),
  });
  (db.delete as ReturnType<typeof vi.fn>).mockReturnValue({
    where: () => Promise.resolve(),
  });
});

describe("DELETE /api/jobs/[id] (s3)", () => {
  it("deletes the bucket prefix for the task", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: "u1" } });
    const res = await DELETE(new Request("http://x/api/jobs/j1"), {
      params: Promise.resolve({ id: "j1" }),
    });
    expect(res.status).toBe(200);
    expect(deleteTaskPrefix).toHaveBeenCalledWith("j1");
  });
});
