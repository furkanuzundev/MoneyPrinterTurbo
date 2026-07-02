import NextAuth from "next-auth";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/db";
import {
  accounts,
  sessions,
  users,
  verificationTokens,
} from "@/db/schema";
import { grantWelcomeBonus } from "@/lib/credits/ledger";
import authConfig from "@/auth.config";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: "database" },
  events: {
    async createUser({ user }) {
      if (!user.id) return;
      try {
        await grantWelcomeBonus(db, user.id);
      } catch (e) {
        // Bonus verilemezse kayıt akışını bozma; dashboard ilk yüklemede
        // idempotent olarak telafi eder.
        console.error("welcome bonus grant failed at signup", e);
      }
    },
  },
  callbacks: {
    ...authConfig.callbacks,
    session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },
});
