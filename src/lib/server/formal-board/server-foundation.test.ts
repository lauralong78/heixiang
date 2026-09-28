import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { digestSessionToken, createSessionToken, FORMAL_BOARD_SESSION_COOKIE } from "./session";
import { getSupabaseRestConfig } from "./supabase-rest";
import { hashPassword, verifyPassword } from "./password";

describe("formal board server foundation", () => {
  it("rejects missing or non-HTTPS Supabase configuration", () => {
    assert.throws(() => getSupabaseRestConfig({}), /incomplete/);
    assert.throws(
      () => getSupabaseRestConfig({ SUPABASE_URL: "http://localhost", SUPABASE_SERVICE_ROLE_KEY: "secret" }),
      /invalid/,
    );
  });

  it("normalizes a valid Supabase configuration without exposing it", () => {
    const config = getSupabaseRestConfig({
      SUPABASE_URL: "https://example.supabase.co/",
      SUPABASE_SECRET_KEY: "server-only-value",
    });
    assert.equal(config.url, "https://example.supabase.co");
    assert.equal(config.serverKey, "server-only-value");
  });

  it("hashes and verifies passwords with a memory-hard hash", async () => {
    const encoded = await hashPassword("correct horse battery staple");
    assert.match(encoded, /^scrypt\$N=16384,r=8,p=1\$/);
    assert.equal(await verifyPassword("correct horse battery staple", encoded), true);
    assert.equal(await verifyPassword("wrong password", encoded), false);
    assert.notEqual(encoded, await hashPassword("correct horse battery staple"));
  });

  it("uses opaque session tokens and only stores their digest", () => {
    const token = createSessionToken();
    assert.equal(token.length > 30, true);
    assert.equal(digestSessionToken(token).length, 64);
    assert.notEqual(digestSessionToken(token), token);
    assert.equal(FORMAL_BOARD_SESSION_COOKIE, "hackkit_formal_session");
  });
});
