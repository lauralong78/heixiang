import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseTaskInput, TaskInputError } from "./task";

describe("formal board task input", () => {
  it("trims a valid task", () => {
    assert.equal(parseTaskInput({ activityId: "550e8400-e29b-41d4-a716-446655440000", teamId: "550e8400-e29b-41d4-a716-446655440001", title: "  Build  ", description: " Notes " }).title, "Build");
  });
  it("rejects invalid task fields", () => {
    assert.throws(() => parseTaskInput({ activityId: "bad", teamId: "bad", title: "x", description: "" }), TaskInputError);
    assert.throws(() => parseTaskInput({ activityId: "550e8400-e29b-41d4-a716-446655440000", teamId: "550e8400-e29b-41d4-a716-446655440001", title: "", description: "" }), TaskInputError);
  });
});
