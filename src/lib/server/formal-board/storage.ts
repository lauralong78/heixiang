import "server-only";

import { FormalBoardLocalError } from "./local-store";

export type FormalBoardStorageMode = "local" | "supabase";

export function getFormalBoardStorageMode(env: Record<string, string | undefined> = process.env): FormalBoardStorageMode {
  const url = env.SUPABASE_URL?.trim();
  const key = (env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY)?.trim();
  return url && key ? "supabase" : "local";
}

export function isLocalFormalBoard(env?: Record<string, string | undefined>) { return getFormalBoardStorageMode(env) === "local"; }

export function translateLocalError(error: unknown): never {
  if (error instanceof FormalBoardLocalError) throw error;
  throw error;
}
