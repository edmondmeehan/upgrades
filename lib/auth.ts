import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Artist, MemberRole, Profile } from "@/lib/types";

export async function getSession() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, profile: null as Profile | null };
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, name, is_super_admin")
    .eq("id", user.id)
    .single<Profile>();
  return { supabase, user, profile };
}

export async function requireUser() {
  const s = await getSession();
  if (!s.user || !s.profile) redirect("/login");
  return s as { supabase: typeof s.supabase; user: NonNullable<typeof s.user>; profile: Profile };
}

export async function requireSuperAdmin() {
  const s = await requireUser();
  if (!s.profile.is_super_admin) notFound();
  return s;
}

/** Loads an artist the current user can see. Super admins get role "admin" when not a member. */
export async function requireArtist(artistId: string, allowed?: MemberRole[]) {
  const s = await requireUser();
  const { data: artist } = await s.supabase.from("artists").select("*").eq("id", artistId).single<Artist>();
  if (!artist) notFound();
  const { data: m } = await s.supabase
    .from("artist_members")
    .select("role")
    .eq("artist_id", artistId)
    .eq("user_id", s.user.id)
    .maybeSingle<{ role: MemberRole }>();
  const role: MemberRole | "admin" | null = m?.role ?? (s.profile.is_super_admin ? "admin" : null);
  if (!role) notFound();
  if (allowed && role !== "admin" && !allowed.includes(role)) notFound();
  return { ...s, artist, role };
}

export const canEditShows = (role: string) => role === "owner" || role === "rep" || role === "admin";
export const isOwnerish = (role: string) => role === "owner" || role === "admin";
