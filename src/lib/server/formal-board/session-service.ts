import "server-only";

import { supabaseRestRequest, supabaseRestRpc } from "./supabase-rest";
import { digestSessionToken } from "./session";
import { isLocalFormalBoard } from "./storage";
import { localCurrent, localRevoke } from "./local-store";

type SessionRow = {
  user_id: string;
  expires_at: string;
  revoked_at: string | null;
};

type UserRow = {
  id: string;
  login_id: string;
  status: string;
  created_at: string;
};

export async function getCurrentUserFromToken(token: string) {
  if (isLocalFormalBoard()) return localCurrent(token);
  const sessions = await supabaseRestRequest<SessionRow[]>(
    `app_sessions?select=user_id,expires_at,revoked_at&token_digest=eq.${encodeURIComponent(digestSessionToken(token))}&limit=1`,
  );
  const session = sessions[0];
  if (!session || session.revoked_at || new Date(session.expires_at).getTime() <= Date.now()) return null;

  const users = await supabaseRestRequest<UserRow[]>(
    `app_users?select=id,login_id,status,created_at&id=eq.${encodeURIComponent(session.user_id)}&limit=1`,
  );
  const user = users[0];
  if (!user || user.status !== "active") return null;
  return { user, session };
}

export async function revokeSession(token: string, requestId: string) {
  if (isLocalFormalBoard()) { localRevoke(token, requestId); return; }
  await supabaseRestRpc("formal_revoke_session", {
    p_token_digest: digestSessionToken(token),
    p_request_id: requestId,
  });
}
