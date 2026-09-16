import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sendMail, createTransport } = vi.hoisted(() => {
  const sendMail = vi.fn();
  return { sendMail, createTransport: vi.fn(() => ({ sendMail })) };
});
vi.mock("nodemailer", () => ({ default: { createTransport } }));

import { MailerNotConfiguredError, sendFeedbackMail } from "../mailer";

const mail = {
  to: "info@reelate.org",
  replyTo: "ada@example.com",
  subject: "[Reelate feedback] Idea — ada@example.com",
  text: "hello",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SMTP_USER", "reelate.sender@gmail.com");
  vi.stubEnv("SMTP_APP_PASSWORD", "abcd efgh ijkl mnop");
  sendMail.mockResolvedValue({ messageId: "x" });
});

afterEach(() => vi.unstubAllEnvs());

describe("sendFeedbackMail", () => {
  it("throws MailerNotConfiguredError when credentials are missing", async () => {
    vi.stubEnv("SMTP_APP_PASSWORD", "");
    await expect(sendFeedbackMail(mail)).rejects.toBeInstanceOf(MailerNotConfiguredError);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("sends through Gmail SMTP from the configured account", async () => {
    await sendFeedbackMail(mail);
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "smtp.gmail.com",
        auth: { user: "reelate.sender@gmail.com", pass: "abcdefghijklmnop" },
      }),
    );
    expect(sendMail).toHaveBeenCalledWith({
      from: '"Reelate Feedback" <reelate.sender@gmail.com>',
      ...mail,
    });
  });

  it("propagates SMTP failures", async () => {
    sendMail.mockRejectedValue(new Error("535 auth failed"));
    await expect(sendFeedbackMail(mail)).rejects.toThrow("535");
  });
});
