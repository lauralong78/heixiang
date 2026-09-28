import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { AuthInputError, parseCredentials } from "./auth";

describe("formal board credentials", () => {
  it("normalizes a valid login id without changing its display value", () => {
    assert.deepEqual(parseCredentials({ loginId: "Alice_01", password: "long enough password" }), {
      loginId: "Alice_01",
      loginIdNormalized: "alice_01",
      password: "long enough password",
    });
  });

  it("rejects malformed ids, short passwords, and non-objects", () => {
    assert.throws(() => parseCredentials(null), AuthInputError);
    assert.throws(() => parseCredentials({ loginId: "ab", password: "long enough password" }), AuthInputError);
    assert.throws(() => parseCredentials({ loginId: "valid_id", password: "short" }), AuthInputError);
    assert.throws(() => parseCredentials({ loginId: "valid_id", password: "x".repeat(129) }), AuthInputError);
  });
});
