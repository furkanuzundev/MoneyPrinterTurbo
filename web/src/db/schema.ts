import {
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { AdapterAccountType } from "next-auth/adapters";

// ---- Auth.js standart tablolar (https://authjs.dev/getting-started/adapters/drizzle)
export const users = pgTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
});

export const accounts = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({ columns: [account.provider, account.providerAccountId] }),
  ],
);

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })],
);

// ---- Reelate tabloları (spec Bölüm 4)
export const creditLedger = pgTable(
  "credit_ledger",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    delta: integer("delta").notNull(),
    kind: text("kind", {
      enum: ["purchase", "spend", "refund", "welcome_bonus"],
    }).notNull(),
    jobId: uuid("job_id"),
    purchaseId: text("purchase_id"),
    createdAt: timestamp("created_at", { mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("credit_ledger_refund_job_unique")
      .on(t.jobId)
      .where(sql`kind = 'refund'`),
    uniqueIndex("credit_ledger_welcome_user_unique")
      .on(t.userId)
      .where(sql`kind = 'welcome_bonus'`),
  ],
);

export const videoJobs = pgTable("video_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  subject: text("subject").notNull(),
  script: text("script").notNull(),
  terms: jsonb("terms").$type<string[]>().notNull(),
  // Sahne bazlı script: null ise iş, sahne yapısı olmadan (düz script) üretilmiştir.
  scenes: jsonb("scenes").$type<
    { tag: string; caption: string; voiceover: string }[]
  >(),
  captionStyle: jsonb("caption_style").$type<{
    size: "sm" | "md" | "lg";
    position: "top" | "center" | "bottom";
    color: "yellow" | "white" | "none";
  }>(),
  aspect: text("aspect").notNull().default("9:16"),
  voice: text("voice").notNull(),
  targetSeconds: integer("target_seconds").notNull(),
  credits: integer("credits").notNull(),
  status: text("status", {
    enum: ["queued", "script", "downloading", "rendering", "done", "failed"],
  })
    .notNull()
    .default("queued"),
  outputPath: text("output_path"),
  error: text("error"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export const purchases = pgTable("purchases", {
  id: serial("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  stripeSessionId: text("stripe_session_id").unique(),
  packageKey: text("package_key").notNull(),
  credits: integer("credits").notNull(),
  amountCents: integer("amount_cents").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export const appConfig = pgTable("app_config", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
});
