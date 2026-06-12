"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const NAV = [
  { href: "/admin", label: "Dashboard", icon: "⊞" },
  { href: "/admin/photos", label: "Photos", icon: "⊡" },
  { href: "/admin/donors", label: "Donors", icon: "♡" },
  { href: "/admin/kitchens", label: "Kitchens", icon: "⊕" },
  { href: "/admin/qr", label: "QR", icon: "▦" },
  { href: "/admin/accounting", label: "Accounting", icon: "₹" },
  { href: "/admin/emails", label: "Emails", icon: "✉" },
  { href: "/admin/settings", label: "Settings", icon: "⚙" },
];

function NavLink({ href, label, icon }: { href: string; label: string; icon: string }) {
  const path = usePathname();
  // For dashboard exact match, for others startsWith
  const active = href === "/admin" ? path === "/admin" : path.startsWith(href);
  return (
    <Link
      href={href}
      className={`flex flex-col md:flex-row items-center gap-1 md:gap-2 px-2 md:px-3 py-2 rounded text-sm min-h-[44px] justify-center md:justify-start transition-colors ${
        active
          ? "bg-clay text-paper"
          : "text-ink hover:bg-sand"
      }`}
    >
      <span className="text-base leading-none">{icon}</span>
      <span className="text-[11px] md:text-sm">{label}</span>
    </Link>
  );
}

export default function AdminShell({
  email,
  children,
}: {
  email: string;
  children: React.ReactNode;
}) {
  const router = useRouter();

  async function handleSignOut() {
    const { adminSignOutAction } = await import("@/lib/admin-actions");
    await adminSignOutAction();
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-paper text-ink">
      {/* Top bar */}
      <header className="sticky top-0 z-30 bg-paper border-b border-line flex items-center justify-between px-4 h-12">
        <span className="font-[family-name:var(--font-fraunces)] font-black text-lg text-ink">
          FeedSomeone <span className="text-clay">·</span>{" "}
          <span className="text-sm font-normal text-ink/60">Ops</span>
        </span>
        <div className="flex items-center gap-3">
          <span className="timestamp text-ink/50 hidden md:block">{email}</span>
          <button
            onClick={handleSignOut}
            className="timestamp text-clay hover:text-clay-deep text-xs min-h-[44px] px-2"
          >
            SIGN OUT
          </button>
        </div>
      </header>

      <div className="flex">
        {/* Desktop sidebar */}
        <nav className="hidden md:flex flex-col w-44 shrink-0 border-r border-line min-h-[calc(100vh-48px)] p-3 gap-1 sticky top-12 h-[calc(100vh-48px)] overflow-y-auto">
          {NAV.map((n) => (
            <NavLink key={n.href} {...n} />
          ))}
        </nav>

        {/* Content */}
        <main className="flex-1 min-w-0 pb-24 md:pb-8 px-4 py-6 max-w-5xl mx-auto md:mx-0">
          {children}
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-paper border-t border-line grid grid-cols-8 safe-bottom">
        {NAV.map((n) => (
          <NavLink key={n.href} {...n} />
        ))}
      </nav>
    </div>
  );
}
