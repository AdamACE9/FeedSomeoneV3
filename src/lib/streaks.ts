import { adminDb } from "@/lib/supabase/server";
import { addDaysToKey, dayKeyInTz } from "@/lib/timewindow";

export const STREAK_MILESTONES = [3, 7, 14, 30, 100] as const;

/**
 * Consecutive donor-tz days with ≥1 paid donation. Same-day repeat donations
 * don't double-count; recurring daily donors auto-qualify (each cycle is paid).
 */
export async function updateStreakOnPayment(donorId: string, paidAt: Date, donorTz: string): Promise<number> {
  const db = adminDb();
  const today = dayKeyInTz(paidAt, donorTz);
  const { data: s } = await db.from("streaks").select("current, longest, last_date").eq("donor_id", donorId).maybeSingle();

  if (s?.last_date === today) return s.current as number;

  const current = s && s.last_date === addDaysToKey(today, -1) ? (s.current as number) + 1 : 1;
  const longest = Math.max(current, (s?.longest as number) ?? 0);
  await db.from("streaks").upsert({ donor_id: donorId, current, longest, last_date: today });
  return current;
}

export function streakBadge(current: number): { days: number; milestone: number } | null {
  if (current < STREAK_MILESTONES[0]) return null;
  const milestone = [...STREAK_MILESTONES].filter((m) => m <= current).pop() ?? STREAK_MILESTONES[0];
  return { days: current, milestone };
}
