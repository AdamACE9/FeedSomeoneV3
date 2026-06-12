import { redirect } from "next/navigation";
import { currentUser } from "@/lib/supabase/server";
import AdminShell from "./AdminShell";

export default async function AdminAppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user || user.role !== "admin") redirect("/admin/login");

  // The password page lives OUTSIDE the (app) group at /admin/password.
  // The (app) layout enforces the gate: if the flag is set, redirect every time.
  // The password page itself calls adminChangePasswordAction which clears the flag,
  // so after changing password the next request to any (app) page succeeds.
  if (user.mustChangePassword) {
    redirect("/admin/password");
  }

  return <AdminShell email={user.email}>{children}</AdminShell>;
}
