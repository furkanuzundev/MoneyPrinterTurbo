import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/signin");
  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
        <span className="font-semibold">Reelate</span>
        <nav className="flex items-center gap-4 text-sm text-zinc-400">
          <a href="/dashboard/create" className="hover:text-white">Create video</a>
          <a href="/dashboard/library" className="hover:text-white">Library</a>
          <a href="/dashboard/buy" className="hover:text-white">Buy credits</a>
        </nav>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-zinc-400">{session.user.email}</span>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <button type="submit" className="text-zinc-400 hover:text-white">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
