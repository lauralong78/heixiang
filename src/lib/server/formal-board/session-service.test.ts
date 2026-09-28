import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { digestSessionToken } from "./session";

describe("formal board session boundary", () => {
  it("never treats the raw cookie value as the database lookup value", () => {
    const token = "opaque-cookie-token";
    assert.notEqual(digestSessionToken(token), token);
    assert.match(digestSessionToken(token), /^[a-f0-9]{64}$/);
  });
});
