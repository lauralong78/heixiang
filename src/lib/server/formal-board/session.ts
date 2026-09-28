import "server-only";

import { createHash, randomBytes } from "node:crypto";

export const FORMAL_BOARD_SESSION_COOKIE = "hackkit_formal_session";
export const FORMAL_BOARD_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export function createSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function digestSessionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function getSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: FORMAL_BOARD_SESSION_MAX_AGE_SECONDS,
  };
}
