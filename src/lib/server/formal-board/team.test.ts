import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { parseTeamInput, TeamInputError } from "./team";

describe("formal board team input", () => {
  it("accepts a UUID and trims team fields", () => {
    assert.deepEqual(parseTeamInput({
      activityId: "550e8400-e29b-41d4-a716-446655440000",
      name: "  Alpha  ",
      description: "  A team ",
    }), {
      activityId: "550e8400-e29b-41d4-a716-446655440000",
      name: "Alpha",
      description: "A team",
    });
  });

  it("rejects malformed team input", () => {
    assert.throws(() => parseTeamInput({ activityId: "bad", name: "Alpha", description: "" }), TeamInputError);
    assert.throws(() => parseTeamInput({ activityId: "550e8400-e29b-41d4-a716-446655440000", name: "", description: "" }), TeamInputError);
  });
});
