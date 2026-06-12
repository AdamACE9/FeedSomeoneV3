import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { currentUser } from "@/lib/supabase/server";
import AdminShell from "./AdminShell";

export default async function AdminAppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user || user.role !== "admin") redirect("/admin/login");

  // Force password change gate — if flag is set redirect to /admin/password
  if (user.mustChangePassword) {
    const hdrs = await headers();
    const path = hdrs.get("x-next-pathname") ?? "";
    if (!path.startsWith("/admin/password")) {
      redirect("/admin/password");
    }
  }

  return <AdminShell email={user.email}>{children}</AdminShell>;
}
