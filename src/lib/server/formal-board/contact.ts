import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { getSupabaseRestConfig, supabaseRestRequest } from "./supabase-rest";
import { isLocalFormalBoard } from "./storage";
import { localContact, localSetContact } from "./local-store";

type ContactRow = { id: string; contact_value_encrypted: string | null; contact_visibility: "private" | "activity_members" };

function keyFromServerSecret() {
  return createHash("sha256").update(getSupabaseRestConfig().serverKey).digest();
}

export function encryptContact(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFromServerSecret(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

function decryptContact(value: string | null) {
  if (!value) return "";
  try {
    const [iv, tag, ciphertext] = value.split(".");
    if (!iv || !tag || !ciphertext) return "";
    const decipher = createDecipheriv("aes-256-gcm", keyFromServerSecret(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return "";
  }
}

export function validateContact(value: unknown) {
  if (value === null || value === "") return "";
  if (typeof value !== "string") throw new Error("联系方式必须是文本。");
  const normalized = value.trim();
  if (normalized.length > 240) throw new Error("联系方式最多 240 个字符。");
  return normalized;
}

export async function getOwnContact(userId: string) {
  if (isLocalFormalBoard()) return localContact(userId);
  const rows = await supabaseRestRequest<ContactRow[]>(`app_users?id=eq.${encodeURIComponent(userId)}&select=id,contact_value_encrypted,contact_visibility`);
  const row = rows[0];
  return { value: decryptContact(row?.contact_value_encrypted ?? null), visibility: row?.contact_visibility ?? "private" as const };
}

export async function setOwnContact(userId: string, value: string) {
  if (isLocalFormalBoard()) return localSetContact(userId, value);
  const rows = await supabaseRestRequest<ContactRow[]>(`app_users?id=eq.${encodeURIComponent(userId)}&select=id,contact_value_encrypted,contact_visibility`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ contact_value_encrypted: value ? encryptContact(value) : null, contact_visibility: "private" }),
  });
  return { value, visibility: rows[0]?.contact_visibility ?? "private" as const };
}
