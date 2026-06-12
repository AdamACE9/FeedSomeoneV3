import { redirect } from "next/navigation";
import { currentUser, serverClient } from "@/lib/supabase/server";
import LoginForm from "./LoginForm";

export const metadata = { title: "Admin Login — FeedSomeone" };

export default async function AdminLoginPage() {
  const user = await currentUser();
  if (user?.role === "admin") redirect("/admin");

  return (
    <div className="min-h-screen bg-sand flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <h1 className="font-[family-name:var(--font-fraunces)] font-black text-2xl text-ink">
            FeedSomeone
          </h1>
          <p className="timestamp text-clay mt-1">OPS PORTAL</p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
