import "server-only";

import { randomUUID } from "node:crypto";

import { hashPassword, verifyPassword } from "./password";
import { createSessionToken, digestSessionToken } from "./session";
import { supabaseRestRequest, supabaseRestRpc } from "./supabase-rest";
import { isLocalFormalBoard } from "./storage";
import { localLogin, localRegister } from "./local-store";

type UserRow = { id: string; login_id: string; status: string; created_at: string; password_hash: string };

export async function registerWithCredentials(credentials: { loginId: string; password: string }, requestId: string) {
  if (isLocalFormalBoard()) return { user: await localRegister(credentials.loginId, credentials.password) };
  const passwordHash = await hashPassword(credentials.password);
  const rows = await supabaseRestRpc<Array<Omit<UserRow, "password_hash">>>("formal_register_user", {
    p_login_id: credentials.loginId,
    p_password_hash: passwordHash,
    p_request_id: requestId,
  });
  const user = rows[0];
  if (!user) throw new Error("Registration returned no user.");
  return { user };
}

export async function loginWithCredentials(credentials: { loginIdNormalized: string; password: string }, requestId: string) {
  if (isLocalFormalBoard()) return localLogin(credentials.loginIdNormalized, credentials.password, requestId);
  const query = new URLSearchParams({
    select: "id,login_id,status,created_at,password_hash",
    login_id_normalized: `eq.${credentials.loginIdNormalized}`,
    limit: "1",
  });
  const rows = await supabaseRestRequest<UserRow[]>(`app_users?${query.toString()}`);
  const user = rows[0];

  if (!user || user.status !== "active" || !(await verifyPassword(credentials.password, user.password_hash))) {
    await recordAuthFailure(requestId);
    return null;
  }

  const token = createSessionToken();
  const tokenDigest = digestSessionToken(token);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  await supabaseRestRpc("formal_create_session", {
    p_user_id: user.id,
    p_token_digest: tokenDigest,
    p_expires_at: expiresAt,
    p_request_id: requestId,
  });

  return { user, token };
}

async function recordAuthFailure(requestId: string) {
  try {
    await supabaseRestRpc("formal_record_auth_failure", {
      p_action: "auth.login",
      p_request_id: requestId,
    });
  } catch {
    // A failed audit write must not reveal whether an account exists.
  }
}

export function newRequestId() {
  return randomUUID();
}
