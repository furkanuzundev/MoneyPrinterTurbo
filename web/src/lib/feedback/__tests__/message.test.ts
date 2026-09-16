import { describe, expect, it } from "vitest";
import { buildFeedbackEmail, parseFeedback } from "../message";

describe("parseFeedback", () => {
  it("accepts a valid body and trims the message", () => {
    const r = parseFeedback({ kind: "bug", message: "  The export button hangs  ", page: "/dashboard/library" });
    expect(r).toEqual({
      ok: true,
      value: { kind: "bug", message: "The export button hangs", page: "/dashboard/library" },
    });
  });

  it("rejects a message shorter than 10 characters", () => {
    const r = parseFeedback({ kind: "idea", message: "   short  " });
    expect(r.ok).toBe(false);
  });

  it("rejects a message longer than 2000 characters", () => {
    const r = parseFeedback({ kind: "idea", message: "a".repeat(2001) });
    expect(r.ok).toBe(false);
  });

  it("falls back to 'other' for an unknown kind", () => {
    const r = parseFeedback({ kind: "<script>", message: "A perfectly fine message" });
    expect(r.ok && r.value.kind).toBe("other");
  });

  it("drops a page value that is not a same-site path", () => {
    const r = parseFeedback({ kind: "bug", message: "A perfectly fine message", page: "https://evil.example" });
    expect(r.ok && r.value.page).toBe("");
  });
});

describe("buildFeedbackEmail", () => {
  const input = {
    feedback: { kind: "bug" as const, message: "The export button hangs", page: "/dashboard/library" },
    user: { id: "u1", name: "Ada", email: "ada@example.com" },
    to: "info@reelate.org",
    now: new Date("2026-09-16T10:00:00Z"),
  };

  it("addresses the inbox and lets a reply go straight to the user", () => {
    const mail = buildFeedbackEmail(input);
    expect(mail.to).toBe("info@reelate.org");
    expect(mail.replyTo).toBe("ada@example.com");
    expect(mail.subject).toBe("[Reelate feedback] Bug — ada@example.com");
  });

  it("carries the message and the context in a plain-text body", () => {
    const { text } = buildFeedbackEmail(input);
    expect(text).toContain("The export button hangs");
    expect(text).toContain("Ada <ada@example.com>");
    expect(text).toContain("u1");
    expect(text).toContain("/dashboard/library");
    expect(text).toContain("2026-09-16T10:00:00.000Z");
  });

  it("omits replyTo when the account has no email", () => {
    const mail = buildFeedbackEmail({ ...input, user: { id: "u1", name: "Ada", email: "" } });
    expect(mail.replyTo).toBeUndefined();
    expect(mail.subject).toBe("[Reelate feedback] Bug — u1");
  });

  it("strips line breaks from the subject so headers cannot be injected", () => {
    const mail = buildFeedbackEmail({ ...input, user: { id: "u1", name: "x", email: "a@b.com\r\nBcc: z@z.com" } });
    expect(mail.subject).not.toMatch(/[\r\n]/);
  });
});
