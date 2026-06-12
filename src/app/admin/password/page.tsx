import { redirect } from "next/navigation";
import { currentUser } from "@/lib/supabase/server";
import PasswordForm from "./PasswordForm";

export const metadata = { title: "Change Password — FeedSomeone Ops" };

export default async function AdminPasswordPage() {
  const user = await currentUser();
  if (!user) redirect("/admin/login");
  if (user.role !== "admin") redirect("/admin/login");

  return (
    <div className="min-h-screen bg-sand flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <h1 className="font-[family-name:var(--font-fraunces)] font-black text-2xl text-ink">
            Set a new password
          </h1>
          <p className="text-sm text-ink/70 mt-1">
            Your account requires a password change before continuing.
          </p>
        </div>
        <PasswordForm actorEmail={user.email} />
      </div>
    </div>
  );
}
