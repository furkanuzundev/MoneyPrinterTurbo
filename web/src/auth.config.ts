import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

export default {
  providers: [Google],
  pages: { signIn: "/signin" },
  callbacks: {
    authorized({ auth: session, request }) {
      if (request.nextUrl.pathname.startsWith("/dashboard")) {
        return !!session?.user;
      }
      return true;
    },
  },
} satisfies NextAuthConfig;
