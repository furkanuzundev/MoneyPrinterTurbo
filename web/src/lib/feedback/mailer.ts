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

  const transport = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass },
  });
  await transport.sendMail({ from: `"Reelate Feedback" <${user}>`, ...mail });
}
