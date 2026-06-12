import { adminDb, currentUser } from "@/lib/supabase/server";
import CountriesClient from "./CountriesClient";

export const metadata = { title: "Countries — FeedSomeone Ops" };

export default async function CountriesPage() {
  const db = adminDb();
  const user = await currentUser();

  const { data: countries } = await db
    .from("countries")
    .select("code, name, enabled")
    .order("name");

  return (
    <CountriesClient
      countries={(countries ?? []).map((c) => ({
        code: c.code as string,
        name: c.name as string,
        enabled: c.enabled as boolean,
      }))}
      actorEmail={user?.email ?? "admin"}
    />
  );
}
