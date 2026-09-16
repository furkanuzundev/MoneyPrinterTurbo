import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/db", () => ({ db: { select: vi.fn() } }));
vi.mock("@/lib/jobs/queue", () => ({ getRedis: () => ({}) }));
vi.mock("@/lib/jobs/status", () => ({ syncJobStatus: vi.fn() }));

import { auth } from "@/auth";
import { db } from "@/db";
import { syncJobStatus } from "@/lib/jobs/status";
import { GET } from "../active/route";

const authMock = auth as ReturnType<typeof vi.fn>;
const syncMock = syncJobStatus as ReturnType<typeof vi.fn>;

function mockRows(rows: unknown[]) {
  (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
    from: () => ({ where: () => Promise.resolve(rows) }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue({ user: { id: "u1" } });
  mockRows([{ id: "j1" }, { id: "j2" }]);
});

describe("GET /api/jobs/active", () => {
  it("rejects anonymous callers", async () => {
    authMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns the freshest status and progress per active job", async () => {
    syncMock.mockImplementation(async (_db, _redis, id: string) =>
      id === "j1"
        ? { job: { id, status: "rendering" }, progress: 42 }
        : { job: { id, status: "done" }, progress: 100 },
    );
    const res = await GET();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      jobs: [
        { id: "j1", status: "rendering", progress: 42 },
        { id: "j2", status: "done", progress: 100 },
      ],
    });
  });

  it("skips jobs that vanished between the query and the sync", async () => {
    syncMock.mockImplementation(async (_db, _redis, id: string) =>
      id === "j1" ? { job: { id, status: "queued" }, progress: 0 } : null,
    );
    const res = await GET();
    await expect(res.json()).resolves.toEqual({
      jobs: [{ id: "j1", status: "queued", progress: 0 }],
    });
  });

  it("answers with an empty list when nothing is active", async () => {
    mockRows([]);
    const res = await GET();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ jobs: [] });
    expect(syncMock).not.toHaveBeenCalled();
  });
});
