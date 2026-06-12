import { now } from "@/lib/clock";
import { sendDueDeliveries } from "@/lib/deliver";
import { retryWaitingDays } from "@/lib/assignment";

/**
 * The 60-second heartbeat (Firebase scheduled fn in prod, dev-cron.mjs locally).
 * 1) send every due photo email   2) every 5th minute, retry waiting/partial days.
 */
export async function POST(req: Request): Promise<Response> {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("unauthorized", { status: 401 });
  }

  const t = await now();
  const result = await sendDueDeliveries(50);

  let retried = 0;
  const force = new URL(req.url).searchParams.get("retry") === "1";
  if (force || t.getUTCMinutes() % 5 === 0) {
    retried = await retryWaitingDays();
  }

  return Response.json({ at: t.toISOString(), ...result, retried });
}
