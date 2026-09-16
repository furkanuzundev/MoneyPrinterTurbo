export const FEEDBACK_KINDS = [
  { value: "bug", label: "Bug" },
  { value: "idea", label: "Idea" },
  { value: "other", label: "Other" },
] as const;

export type FeedbackKind = (typeof FEEDBACK_KINDS)[number]["value"];

export const MIN_MESSAGE_CHARS = 10;
export const MAX_MESSAGE_CHARS = 2000;

export type Feedback = { kind: FeedbackKind; message: string; page: string };

export type FeedbackMail = {
  to: string;
  replyTo?: string;
  subject: string;
  text: string;
};

export function parseFeedback(
  body: unknown,
): { ok: true; value: Feedback } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const message = String(b.message ?? "").trim();
  if (message.length < MIN_MESSAGE_CHARS) {
    return { ok: false, error: `Write at least ${MIN_MESSAGE_CHARS} characters` };
  }
  if (message.length > MAX_MESSAGE_CHARS) {
    return { ok: false, error: `Keep it under ${MAX_MESSAGE_CHARS} characters` };
  }
  const kind = FEEDBACK_KINDS.find((k) => k.value === b.kind)?.value ?? "other";
  // Sadece site içi yol; dış URL veya "//host" kabul edilmez.
  const rawPage = String(b.page ?? "").slice(0, 200);
  const page = /^\/(?!\/)[^\s]*$/.test(rawPage) ? rawPage : "";
  return { ok: true, value: { kind, message, page } };
}

// Başlıklara giren değerlerde satır sonu header enjeksiyonuna kapı açar.
const oneLine = (s: string) => s.replace(/[\r\n]+/g, " ").trim();

export function buildFeedbackEmail({
  feedback,
  user,
  to,
  now,
}: {
  feedback: Feedback;
  user: { id: string; name: string; email: string };
  to: string;
  now: Date;
}): FeedbackMail {
  const label = FEEDBACK_KINDS.find((k) => k.value === feedback.kind)!.label;
  const email = oneLine(user.email);
  const name = oneLine(user.name);
  const who = email ? (name ? `${name} <${email}>` : email) : name || "(no name)";

  const text = [
    feedback.message,
    "",
    "—",
    `Type:  ${label}`,
    `From:  ${who}`,
    `User:  ${user.id}`,
    `Page:  ${feedback.page || "(unknown)"}`,
    `Sent:  ${now.toISOString()}`,
  ].join("\n");

  return {
    to,
    replyTo: email || undefined,
    subject: `[Reelate feedback] ${label} — ${email || user.id}`,
    text,
  };
}
