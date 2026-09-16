import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
const redis = { incr: vi.fn(), expire: vi.fn() };
vi.mock("@/lib/jobs/queue", () => ({ getRedis: () => redis }));
vi.mock("@/lib/feedback/mailer", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/feedback/mailer")>()),
  sendFeedbackMail: vi.fn(),
}));

import { auth } from "@/auth";
import { MailerNotConfiguredError, sendFeedbackMail } from "@/lib/feedback/mailer";
import { POST } from "../route";

const authMock = auth as ReturnType<typeof vi.fn>;
const sendMock = sendFeedbackMail as ReturnType<typeof vi.fn>;

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/feedback", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );
}

const valid = { kind: "idea", message: "Please add a dark/light toggle", page: "/dashboard" };

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue({ user: { id: "u1", name: "Ada", email: "ada@example.com" } });
  redis.incr.mockResolvedValue(1);
  sendMock.mockResolvedValue(undefined);
});

describe("POST /api/feedback", () => {
  it("rejects anonymous callers", async () => {
    authMock.mockResolvedValue(null);
    const res = await post(valid);
    expect(res.status).toBe(401);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("rejects a too-short message without sending mail", async () => {
    const res = await post({ ...valid, message: "hi" });
    expect(res.status).toBe(400);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("returns 429 once the hourly limit is exceeded", async () => {
    redis.incr.mockResolvedValue(6);
    const res = await post(valid);
    expect(res.status).toBe(429);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("sends the feedback to the inbox with the user as reply-to", async () => {
    const res = await post(valid);
    expect(res.status).toBe(200);
    expect(sendMock).toHaveBeenCalledOnce();
    const mail = sendMock.mock.calls[0][0];
    expect(mail.to).toBe("info@reelate.org");
    expect(mail.replyTo).toBe("ada@example.com");
    expect(mail.text).toContain("Please add a dark/light toggle");
  });

  it("returns 503 when SMTP is not configured", async () => {
    sendMock.mockRejectedValue(new MailerNotConfiguredError());
    const res = await post(valid);
    expect(res.status).toBe(503);
  });

  it("returns 502 when the SMTP server fails", async () => {
    sendMock.mockRejectedValue(new Error("535 auth failed"));
    const res = await post(valid);
    expect(res.status).toBe(502);
  });
});
