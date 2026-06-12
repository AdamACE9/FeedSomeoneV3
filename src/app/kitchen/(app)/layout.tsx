import { redirect } from "next/navigation";
import { currentUser, serverClient } from "@/lib/supabase/server";

async function signOutAction() {
  "use server";
  const supa = await serverClient();
  await supa.auth.signOut();
  redirect("/kitchen/login");
}

export default async function KitchenAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser();

  if (!user || user.role !== "kitchen") {
    redirect("/kitchen/login");
  }

  const kitchenName = user.displayName ?? "Kitchen";

  return (
    <div className="min-h-screen bg-paper flex flex-col">
      {/* Top bar */}
      <header className="bg-sand border-b border-line px-4 h-12 flex items-center justify-between shrink-0">
        <span
          className="text-xs text-ink/70 tracking-widest uppercase"
          style={{ fontFamily: "var(--font-dm-mono)" }}
        >
          {kitchenName}
        </span>
        <form action={signOutAction}>
          <button
            type="submit"
            className="text-xs text-ink/50 h-11 px-3 active:text-clay"
            style={{ fontFamily: "var(--font-dm-mono)" }}
          >
            Sign out
          </button>
        </form>
      </header>

      {/* Page content */}
      <main className="flex-1">{children}</main>
    </div>
  );
}
