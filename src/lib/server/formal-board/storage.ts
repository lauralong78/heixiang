import "server-only";

export type FormalBoardStorageMode = "local" | "supabase";

export class FormalBoardStorageConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FormalBoardStorageConfigurationError";
  }
}

export function getFormalBoardStorageMode(env: Record<string, string | undefined> = process.env): FormalBoardStorageMode {
  const requested = env.FORMAL_BOARD_STORAGE_MODE?.trim().toLowerCase();
  if (!requested || requested === "local") return "local";
  if (requested !== "supabase") throw new FormalBoardStorageConfigurationError("FORMAL_BOARD_STORAGE_MODE 只能是 local 或 supabase。");
  const url = env.SUPABASE_URL?.trim();
  const key = (env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY)?.trim();
  if (!url || !key) throw new FormalBoardStorageConfigurationError("已显式选择 Supabase，但缺少 SUPABASE_URL 或服务端 Secret；请补齐配置，或移除 FORMAL_BOARD_STORAGE_MODE 以使用本机模式。");
  return "supabase";
}

export function isLocalFormalBoard(env?: Record<string, string | undefined>) { return getFormalBoardStorageMode(env) === "local"; }
