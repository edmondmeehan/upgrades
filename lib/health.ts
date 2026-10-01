import { createAdminClient } from "@/lib/supabase/admin";

export const JOBS: Record<string, string> = {
  "stripe-webhook": "Stripe webhooks", "daily-sales": "Daily sales email", "checkin-emails": "Check-in emails", email: "Sending email",
};

/** Records that a background job worked. */
export async function markOk(job: string) {
  const db = createAdminClient();
  if (!db) return;
  await db.from("system_runs").upsert({ job, last_ok_at: new Date().toISOString() }, { onConflict: "job" });
}

/** Records a failure and emails P&T admins (at most once an hour per job). */
export async function markError(job: string, err: unknown) {
  const db = createAdminClient();
  if (!db) return;
  const message = (err instanceof Error ? err.message : String(err ?? "unknown error")).slice(0, 500);
  const now = new Date();
  const { data: cur } = await db.from("system_runs").select("last_alert_at, error_count").eq("job", job).maybeSingle();
  const alert = job !== "email" && (!cur?.last_alert_at || now.getTime() - new Date(cur.last_alert_at).getTime() > 3600_000);
  await db.from("system_runs").upsert({
    job, last_error_at: now.toISOString(), last_error: message, error_count: (cur?.error_count ?? 0) + 1,
    ...(alert ? { last_alert_at: now.toISOString() } : {}),
  }, { onConflict: "job" });
  if (!alert) return;
  try {
    const { sendEmail, siteUrl } = await import("@/lib/email");
    const { data: admins } = await db.from("profiles").select("email").eq("is_super_admin", true);
    const to = [...new Set([process.env.ADMIN_NOTIFY_EMAIL, ...(admins ?? []).map((a) => a.email)].filter(Boolean))] as string[];
    for (const email of to) {
      await sendEmail({
        to: email, subject: `Upgrades alert: ${JOBS[job] ?? job} failed`,
        eyebrow: "System alert", title: `${JOBS[job] ?? job} failed`,
        body: [`It failed at ${now.toLocaleString("en-US", { timeZone: "America/New_York" })} Eastern with: ${message}`, "You won't get another alert for this for an hour. The System health card in P&T admin shows the latest status."],
        button: { label: "Open P&T admin", url: `${siteUrl()}/admin` },
      });
    }
  } catch (e) { console.error("[health] alert", e); }
}
