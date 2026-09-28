import "server-only";

const SUPABASE_REST_PATH = "/rest/v1";

export type SupabaseRestConfig = {
  url: string;
  serverKey: string;
};

export class SupabaseRestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "SupabaseRestError";
    this.status = status;
  }
}

export type ServerEnvironment = Record<string, string | undefined>;

export function getSupabaseRestConfig(env: ServerEnvironment = process.env): SupabaseRestConfig {
  const url = env.SUPABASE_URL?.trim();
  const serverKey = env.SUPABASE_SECRET_KEY?.trim() ?? env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !serverKey) {
    throw new Error("Formal board server configuration is incomplete.");
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error("Formal board server configuration is invalid.");
  }

  if (parsedUrl.protocol !== "https:" || parsedUrl.pathname !== "/") {
    throw new Error("Formal board server configuration is invalid.");
  }

  return { url: parsedUrl.toString().replace(/\/$/, ""), serverKey };
}

export async function supabaseRestRequest<T>(
  table: string,
  init: RequestInit = {},
  env: ServerEnvironment = process.env,
): Promise<T> {
  const resourcePath = table.split("?", 1)[0];
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(resourcePath) && !/^rpc\/formal_[a-z0-9_]{1,60}$/.test(resourcePath)) {
    throw new Error("Invalid Supabase table name.");
  }

  const config = getSupabaseRestConfig(env);
  const headers = new Headers(init.headers);
  headers.set("apikey", config.serverKey);
  headers.set("Authorization", `Bearer ${config.serverKey}`);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${config.url}${SUPABASE_REST_PATH}/${table}`, {
    ...init,
    headers,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new SupabaseRestError("Supabase request failed.", response.status);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function supabaseRestRpc<T>(
  functionName: string,
  body: Record<string, unknown>,
  env: ServerEnvironment = process.env,
): Promise<T> {
  if (!/^formal_[a-z0-9_]{1,60}$/.test(functionName)) {
    throw new Error("Invalid Supabase function name.");
  }

  return supabaseRestRequest<T>(`rpc/${functionName}`, {
    method: "POST",
    body: JSON.stringify(body),
  }, env);
}
