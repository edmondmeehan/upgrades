export type ArtistStatus = "draft" | "pending" | "approved" | "rejected" | "suspended";
export type MemberRole = "owner" | "rep" | "accountant" | "door";
export type ProofMethod = "code_post" | "domain_email" | "third_party";

export type Profile = { id: string; email: string; name: string | null; is_super_admin: boolean };

export type Artist = {
  id: string;
  name: string;
  handle: string;
  website: string | null;
  bio: string | null;
  status: ArtistStatus;
  verification_code: string;
  verified_at: string | null;
  fee_bps: number;
  managed_candidate: boolean;
  created_at: string;
};

export type Tour = {
  id: string;
  artist_id: string;
  name: string;
  description: string | null;
  status: "active" | "archived";
  created_at: string;
};

export type Show = {
  id: string;
  artist_id: string;
  tour_id: string;
  slug: string;
  show_date: string;
  doors_time: string | null;
  show_time: string | null;
  timezone: string;
  venue_name: string | null;
  address: string | null;
  city: string | null;
  region: string | null;
  country: string;
  postal_code: string | null;
  status: "draft" | "published" | "cancelled";
};

export type Submission = {
  id: string;
  artist_id: string;
  website: string;
  socials: Record<string, string>;
  proof_method: ProofMethod;
  proof_post_url: string | null;
  proof_code: string | null;
  submitter_email: string;
  domain_email_match: boolean;
  third_party_name: string | null;
  third_party_email: string | null;
  third_party_relation: string | null;
  third_party_confirmed_at: string | null;
  notes: string | null;
  status: "pending" | "approved" | "rejected" | "superseded";
  checklist: Record<string, boolean>;
  reviewer_notes: string | null;
  decided_at: string | null;
  created_at: string;
};

export const ROLE_LABEL: Record<MemberRole, string> = {
  owner: "Artist",
  rep: "Artist rep",
  accountant: "Accountant",
  door: "Door staff",
};
