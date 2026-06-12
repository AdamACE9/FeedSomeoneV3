import { setClockOverride } from "@/lib/clock";

/** Test-only time travel. 404 unless TEST_MODE=1. Body: { "iso": "2027-06-12T08:00:00Z" } or { "iso": null }. */
export async function POST(req: Request): Promise<Response> {
  if (process.env.TEST_MODE !== "1") return new Response(null, { status: 404 });
  const body = (await req.json().catch(() => null)) as { iso?: string | null } | null;
  if (!body || (body.iso !== null && typeof body.iso !== "string")) {
    return Response.json({ error: "body must be { iso: string | null }" }, { status: 400 });
  }
  await setClockOverride(body.iso ?? null);
  return Response.json({ ok: true, clock: body.iso ?? "real" });
}
