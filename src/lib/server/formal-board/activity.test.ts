import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { ActivityInputError, parseActivityInput } from "./activity";

describe("formal board activity input", () => {
  it("trims safe activity input", () => {
    assert.deepEqual(parseActivityInput({ title: "  Demo  ", description: "  Notes " }), {
      title: "Demo",
      description: "Notes",
    });
  });

  it("rejects empty and oversized activity fields", () => {
    assert.throws(() => parseActivityInput({ title: "", description: "" }), ActivityInputError);
    assert.throws(() => parseActivityInput({ title: "x".repeat(121), description: "" }), ActivityInputError);
    assert.throws(() => parseActivityInput({ title: "ok", description: "x".repeat(4001) }), ActivityInputError);
  });
});
