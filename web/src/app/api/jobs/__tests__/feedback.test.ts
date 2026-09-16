import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/db", () => ({ db: { select: vi.fn() } }));
vi.mock("@/lib/feedback/store", () => ({
  getFeedback: vi.fn(async () => null),
  upsertFeedback: vi.fn(async (_db, _job, input) => ({
    rating: input.rating,
    tags: input.tags,
    comment: input.comment,
  })),
}));

import { auth } from "@/auth";
import { db } from "@/db";
import { getFeedback, upsertFeedback } from "@/lib/feedback/store";
import { GET, PUT } from "../[id]/feedback/route";

const ctx = { params: Promise.resolve({ id: "j1" }) };

function mockJob(job: unknown) {
  (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
    from: () => ({ where: () => Promise.resolve(job ? [job] : []) }),
  });
}

function put(body: unknown) {
  return PUT(
    new Request("http://x/api/jobs/j1/feedback", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
    ctx,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: "u1" } });
  mockJob({ id: "j1", userId: "u1", status: "done" });
});

describe("GET /api/jobs/[id]/feedback", () => {
  it("401 when unauthenticated", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await GET(new Request("http://x"), ctx);
    expect(res.status).toBe(401);
  });

  it("404 for someone else's video", async () => {
    mockJob({ id: "j1", userId: "u2", status: "done" });
    const res = await GET(new Request("http://x"), ctx);
    expect(res.status).toBe(404);
  });

  it("returns the saved rating", async () => {
    (getFeedback as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      rating: 3,
      tags: ["voice"],
      comment: null,
    });
    const res = await GET(new Request("http://x"), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      feedback: { rating: 3, tags: ["voice"], comment: null },
    });
  });
});

describe("PUT /api/jobs/[id]/feedback", () => {
  it("401 when unauthenticated", async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    expect((await put({ rating: 5, source: "library" })).status).toBe(401);
  });

  it("404 for a missing video", async () => {
    mockJob(null);
    expect((await put({ rating: 5, source: "library" })).status).toBe(404);
  });

  it("409 while the video is not finished", async () => {
    mockJob({ id: "j1", userId: "u1", status: "rendering" });
    expect((await put({ rating: 5, source: "library" })).status).toBe(409);
    expect(upsertFeedback).not.toHaveBeenCalled();
  });

  it("400 for an invalid rating", async () => {
    expect((await put({ rating: 9, source: "library" })).status).toBe(400);
    expect(upsertFeedback).not.toHaveBeenCalled();
  });

  it("400 for a malformed body", async () => {
    const res = await PUT(
      new Request("http://x", { method: "PUT", body: "{not json" }),
      ctx,
    );
    expect(res.status).toBe(400);
  });

  it("saves the sanitized rating", async () => {
    const res = await put({
      rating: 2,
      tags: ["voice", "nope"],
      comment: "  too fast ",
      source: "done_screen",
    });
    expect(res.status).toBe(200);
    expect(upsertFeedback).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ id: "j1" }),
      { rating: 2, tags: ["voice"], comment: "too fast", source: "done_screen" },
    );
    expect(await res.json()).toEqual({
      feedback: { rating: 2, tags: ["voice"], comment: "too fast" },
    });
  });
});
