import "server-only";

import { randomBytes } from "node:crypto";

import { digestSessionToken } from "./session";
import { supabaseRestRpc } from "./supabase-rest";

export type InviteRow = { id: string; activity_id: string; token_hint: string; role: string; expires_at: string | null; max_uses: number; use_count: number; status: string };
export type JoinRow = { activity_id: string; membership_id: string; role: string; already_joined: boolean; team_id: string; invite_type: string };

export function createInviteToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, digest: digestSessionToken(token), hint: token.slice(0, 8) };
}

export async function createInvite(input: { userId: string; activityId: string; role: "member" | "collaborator"; expiresAt: string | null; maxUses: number; requestId: string }) {
  const token = createInviteToken();
  const rows = await supabaseRestRpc<InviteRow[]>("formal_create_activity_invite", {
    p_user_id: input.userId, p_activity_id: input.activityId, p_token_digest: token.digest, p_token_hint: token.hint,
    p_role: input.role, p_expires_at: input.expiresAt, p_max_uses: input.maxUses, p_request_id: input.requestId,
  });
  if (!rows[0]) throw new Error("Invite creation returned no invite.");
  return { invite: rows[0], token: token.token };
}

export async function createScopedInvite(input: { userId: string; activityId: string; inviteType: "activity_team" | "team_member"; teamId?: string | null; teamName?: string | null; expiresAt: string | null; maxUses: number; requestId: string }) {
  const token = createInviteToken();
  const rows = await supabaseRestRpc<InviteRow[]>("formal_create_activity_invite_v2", {
    p_user_id: input.userId, p_activity_id: input.activityId, p_invite_type: input.inviteType, p_team_id: input.teamId ?? null, p_team_name: input.teamName ?? null,
    p_token_digest: token.digest, p_token_hint: token.hint, p_expires_at: input.expiresAt, p_max_uses: input.maxUses, p_request_id: input.requestId,
  });
  if (!rows[0]) throw new Error("Scoped invite creation returned no invite.");
  return { invite: rows[0], token: token.token };
}

export function joinInvite(input: { userId: string; token: string; requestId: string }) {
  return supabaseRestRpc<JoinRow[]>("formal_join_activity_invite_v2", { p_user_id: input.userId, p_token_digest: digestSessionToken(input.token), p_request_id: input.requestId });
}

export function revokeInvite(input: { userId: string; inviteId: string; requestId: string }) {
  return supabaseRestRpc<unknown[]>("formal_revoke_activity_invite", { p_user_id: input.userId, p_invite_id: input.inviteId, p_request_id: input.requestId });
}
