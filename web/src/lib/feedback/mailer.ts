import nodemailer from "nodemailer";
import type { FeedbackMail } from "./message";

export class MailerNotConfiguredError extends Error {
  constructor() {
    super("SMTP_USER / SMTP_APP_PASSWORD are not set");
    this.name = "MailerNotConfiguredError";
  }
}

export async function sendFeedbackMail(mail: FeedbackMail): Promise<void> {
  const user = process.env.SMTP_USER?.trim();
  // Google uygulama şifresini boşluklu gösterir; SMTP boşluksuz ister.
  const pass = process.env.SMTP_APP_PASSWORD?.replace(/\s+/g, "");
  if (!user || !pass) throw new MailerNotConfiguredError();

  // Hetzner giden 465'i engelliyor; 587 + STARTTLS açık. Zaman aşımları olmadan
  // erişilemeyen SMTP isteği ~2 dk askıda tutuyor, form "Sending…"de kalıyordu.
  const transport = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    requireTLS: true,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    auth: { user, pass },
  });
  await transport.sendMail({ from: `"Reelate Feedback" <${user}>`, ...mail });
}
