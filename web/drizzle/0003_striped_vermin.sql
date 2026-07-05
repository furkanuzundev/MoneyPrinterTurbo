ALTER TABLE "credit_ledger" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
UPDATE "user" u SET "created_at" = wb."created_at"
FROM (SELECT "user_id", "created_at" FROM "credit_ledger" WHERE "kind" = 'welcome_bonus') wb
WHERE wb."user_id" = u."id";