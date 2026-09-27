import assert from "node:assert/strict";
import test from "node:test";

import { normalizeRepositoryDraft, parseRepositoryDraft, serializeRepositoryDraft } from "./local-draft";

test("repository draft persists only a canonical public GitHub URL", () => {
  const serialized = serializeRepositoryDraft(" https://github.com/octocat/Hello-World ");
  assert.ok(serialized);
  assert.equal(parseRepositoryDraft(serialized), "https://github.com/octocat/Hello-World");
});

test("repository draft refuses credentials, query strings, and malformed storage", () => {
  assert.equal(normalizeRepositoryDraft("https://user:secret@github.com/a/b"), null);
  assert.equal(normalizeRepositoryDraft("https://github.com/a/b?token=secret"), null);
  assert.throws(() => parseRepositoryDraft("{"), /JSON/);
  assert.throws(() => parseRepositoryDraft(JSON.stringify({ version: 2, repositoryUrl: "https://github.com/a/b" })), /版本/);
});
