import { adminDb } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * SSE live counter — pushes whenever the numbers move (checked every 10s
 * server-side), heartbeats every 25s so proxies keep the pipe open.
 */
export async function GET(req: Request): Promise<Response> {
  const encoder = new TextEncoder();
  let closed = false;
  let interval: ReturnType<typeof setInterval> | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      let last = "";
      const push = async () => {
        if (closed) return;
        try {
          const { data } = await adminDb().rpc("get_public_stats");
          const json = JSON.stringify(data ?? {});
          if (json !== last) {
            last = json;
            controller.enqueue(encoder.encode(`data: ${json}\n\n`));
          }
        } catch {
          /* transient db hiccup — next tick */
        }
      };
      await push();
      interval = setInterval(push, 10_000);
      heartbeat = setInterval(() => {
        if (!closed) controller.enqueue(encoder.encode(`: hb\n\n`));
      }, 25_000);

      req.signal.addEventListener("abort", () => {
        closed = true;
        if (interval) clearInterval(interval);
        if (heartbeat) clearInterval(heartbeat);
        try { controller.close(); } catch { /* already closed */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
