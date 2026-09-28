import "server-only";

const LOGIN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{2,31}$/;
const PASSWORD_MIN_LENGTH = 10;
const PASSWORD_MAX_LENGTH = 128;

export type Credentials = {
  loginId: string;
  loginIdNormalized: string;
  password: string;
};

export class AuthInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthInputError";
  }
}

export function parseCredentials(input: unknown): Credentials {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new AuthInputError("请输入账号和密码。");
  }

  const record = input as Record<string, unknown>;
  const loginId = typeof record.loginId === "string" ? record.loginId.trim() : "";
  const password = typeof record.password === "string" ? record.password : "";

  if (!LOGIN_ID_PATTERN.test(loginId)) {
    throw new AuthInputError("账号需为 3–32 位字母、数字、点、下划线或短横线。");
  }
  if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
    throw new AuthInputError("密码长度需为 10–128 位。");
  }

  return { loginId, loginIdNormalized: loginId.toLowerCase(), password };
}

export function publicUser(row: { id: string; login_id: string; status: string; created_at: string }) {
  return {
    id: row.id,
    loginId: row.login_id,
    status: row.status,
    createdAt: row.created_at,
  };
}
