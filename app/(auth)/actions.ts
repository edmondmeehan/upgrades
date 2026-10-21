"use server";
import { redirect } from "next/navigation";
import { isHuman, HUMAN_FAIL } from "@/lib/human";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/email";
import { cleanError, withMsg } from "@/lib/util";

const safeNext = (n: FormDataEntryValue | null) => {
  const s = typeof n === "string" ? n : "";
  return s.startsWith("/") && !s.startsWith("//") ? s : "/dashboard";
};

export async function signIn(fd: FormData) {
  const next = safeNext(fd.get("next"));
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(fd.get("email") ?? "").trim(),
    password: String(fd.get("password") ?? ""),
  });
  if (error) redirect(withMsg(`/login?next=${encodeURIComponent(next)}`, "err", "That email and password don't match."));
  redirect(next);
}

export async function sendMagicLink(fd: FormData) {
  const next = safeNext(fd.get("next"));
  const email = String(fd.get("email") ?? "").trim();
  if (!email) redirect(withMsg(`/login?next=${encodeURIComponent(next)}`, "err", "Enter your email first."));
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${siteUrl()}/auth/callback?next=${encodeURIComponent(next)}`, shouldCreateUser: false },
  });
  if (error) redirect(withMsg(`/login?next=${encodeURIComponent(next)}`, "err", "We couldn't send a link to that email. Create an account first."));
  redirect(withMsg(`/login?next=${encodeURIComponent(next)}`, "ok", `Sign-in link sent to ${email}.`));
}

export async function signUp(fd: FormData) {
  const next = safeNext(fd.get("next"));
  const email = String(fd.get("email") ?? "").trim();
  const password = String(fd.get("password") ?? "");
  const name = String(fd.get("name") ?? "").trim();
  const back = `/signup?next=${encodeURIComponent(next)}`;
  if (password.length < 8) redirect(withMsg(back, "err", "Use at least 8 characters for your password."));
  if (fd.get("terms") !== "on") redirect(withMsg(back, "err", "Accept the artist terms to continue."));
  if (!(await isHuman(fd))) redirect(withMsg(back, "err", HUMAN_FAIL));
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email, password,
    options: { data: { name, accepted_terms_at: new Date().toISOString() }, emailRedirectTo: `${siteUrl()}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error) redirect(withMsg(back, "err", cleanError(error)));
  if (data.session) redirect(next);
  redirect(withMsg(`/login?next=${encodeURIComponent(next)}`, "ok", `Check ${email} to confirm your account, then sign in.`));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function updateName(fd: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { error } = await supabase.from("profiles").update({ name: String(fd.get("name") ?? "").trim() || null }).eq("id", user.id);
  redirect(withMsg("/account", error ? "err" : "ok", error ? cleanError(error) : "Name saved."));
}

export async function updatePassword(fd: FormData) {
  const password = String(fd.get("password") ?? "");
  if (password.length < 8) redirect(withMsg("/account", "err", "Use at least 8 characters."));
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  redirect(withMsg("/account", error ? "err" : "ok", error ? cleanError(error) : "Password updated."));
}

/** Forgot password: Supabase emails a reset link (from the branded "Reset password" template). */
export async function requestPasswordReset(fd: FormData) {
  const email = String(fd.get("email") ?? "").trim();
  if (!email) redirect(withMsg("/forgot-password", "err", "Enter your email."));
  if (!(await isHuman(fd))) redirect(withMsg("/forgot-password", "err", HUMAN_FAIL));
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${siteUrl()}/auth/callback?next=/reset-password` });
  // Same message either way, so this page can't be used to check who has an account.
  redirect(withMsg("/forgot-password", "ok", `If ${email} has an account, we've emailed a link to reset the password. It works for one hour.`));
}

/** Reset password: the reset link signs you in, then you choose a new password. */
export async function setNewPassword(fd: FormData) {
  const password = String(fd.get("password") ?? "");
  if (password.length < 8) redirect(withMsg("/reset-password", "err", "Use at least 8 characters."));
  if (password !== String(fd.get("confirm") ?? "")) redirect(withMsg("/reset-password", "err", "The two passwords don't match."));
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(withMsg("/forgot-password", "err", "That reset link has expired. Request a new one."));
  const { error } = await supabase.auth.updateUser({ password });
  if (error) redirect(withMsg("/reset-password", "err", cleanError(error)));
  redirect(withMsg("/dashboard", "ok", "Password updated."));
}
