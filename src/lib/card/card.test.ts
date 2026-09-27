import assert from "node:assert/strict";
import test from "node:test";

import { EMPTY_CARD, parseCardDraft, serializeCardDraft } from "./card";

test("card draft round-trips through a versioned local envelope", () => {
  const draft = { ...EMPTY_CARD, name: "林舟", skills: "React，路演" };
  assert.deepEqual(parseCardDraft(serializeCardDraft(draft)), draft);
});

test("card draft rejects malformed, unknown-version, and oversized data", () => {
  assert.throws(() => parseCardDraft("{"), /JSON/);
  assert.throws(() => parseCardDraft(JSON.stringify({ version: 2, draft: EMPTY_CARD })), /版本/);
  assert.throws(() => parseCardDraft(serializeCardDraft({ ...EMPTY_CARD, name: "x".repeat(25) })), /name/);
});
