"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireArtist } from "@/lib/auth";
import { sendSettlement } from "@/lib/settlement";
import { withMsg } from "@/lib/util";

/** Send (or resend) a show's settlement statement to the owners and accountants, or just to me. */
export async function sendStatement(artistId: string, showId: string, justMe: boolean) {
  const { profile } = await requireArtist(artistId, ["owner", "accountant"]);
  const back = `/a/${artistId}/financials/shows/${showId}`;
  const r = await sendSettlement(showId, justMe ? { onlyTo: profile.email } : {});
  revalidatePath(back);
  if (!r.sent) redirect(withMsg(back, "err", r.error ?? "The statement didn't send."));
  redirect(withMsg(back, "ok", justMe ? `Statement sent to ${profile.email}.` : `${r.revised ? "Revised statement" : "Statement"} sent to ${r.sent} ${r.sent === 1 ? "person" : "people"}.`));
}
