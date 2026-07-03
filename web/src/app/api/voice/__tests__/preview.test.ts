import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/jobs/queue", () => ({
  getRedis: () => ({
    incr: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
  }),
}));

import { auth } from "@/auth";
import { POST } from "@/app/api/voice/preview/route";

function req(body: unknown) {
  return new Request("http://test/api/voice/preview", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.mocked(auth).mockResolvedValue({ user: { id: "u1" } } as never);
});

describe("POST /api/voice/preview", () => {
  it("401 when unauthenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const res = await POST(req({ voiceName: "tr-TR-EmelNeural-Female" }));
    expect(res.status).toBe(401);
  });

  it("400 when voiceName missing", async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });

  it("streams audio on backend success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { "content-type": "audio/mpeg" },
        }),
      ),
    );
    const res = await POST(req({ voiceName: "tr-TR-EmelNeural-Female" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("audio/mpeg");
  });

  it("502 when backend fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("nope", { status: 502 })),
    );
    const res = await POST(req({ voiceName: "tr-TR-EmelNeural-Female" }));
    expect(res.status).toBe(502);
  });
});
