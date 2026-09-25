import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { getDeepSeekAvailability } from "./config";
import { callDeepSeek } from "./deepseek";

const originalFetch = globalThis.fetch;
const originalEnvironment = {
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseUrl: process.env.DEEPSEEK_BASE_URL,
  model: process.env.DEEPSEEK_MODEL,
};

function restoreEnvironmentVariable(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  restoreEnvironmentVariable("DEEPSEEK_API_KEY", originalEnvironment.apiKey);
  restoreEnvironmentVariable("DEEPSEEK_BASE_URL", originalEnvironment.baseUrl);
  restoreEnvironmentVariable("DEEPSEEK_MODEL", originalEnvironment.model);
});

test("reports a missing API key as disabled without exposing configuration", () => {
  delete process.env.DEEPSEEK_API_KEY;

  assert.deepEqual(getDeepSeekAvailability(), {
    status: "disabled",
    reason: "missing_api_key",
  });
});

test("distinguishes invalid local configuration from an upstream failure", async () => {
  process.env.DEEPSEEK_API_KEY = "test-secret";
  process.env.DEEPSEEK_BASE_URL = "http://not-a-loopback.example";

  const result = await callDeepSeek({ task: "Summarize this." });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.kind, "configuration");
    assert.equal(result.error.code, "AI_CONFIGURATION_ERROR");
    assert.equal(JSON.stringify(result).includes("test-secret"), false);
  }
});

test("rejects oversized input before contacting DeepSeek", async () => {
  process.env.DEEPSEEK_API_KEY = "test-secret";
  delete process.env.DEEPSEEK_BASE_URL;
  let fetchCalled = false;
  globalThis.fetch = (async () => {
    fetchCalled = true;
    throw new Error("fetch should not run");
  }) as typeof fetch;

  const result = await callDeepSeek({ task: "x".repeat(8_001) });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.kind, "input");
  assert.equal(fetchCalled, false);
});

test("normalizes DeepSeek rate limiting without returning its response body", async () => {
  process.env.DEEPSEEK_API_KEY = "test-secret";
  delete process.env.DEEPSEEK_BASE_URL;
  globalThis.fetch = (async () =>
    new Response('{"error":{"message":"sensitive upstream detail"}}', {
      status: 429,
    })) as typeof fetch;

  const result = await callDeepSeek({ task: "Summarize this." });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "AI_UPSTREAM_RATE_LIMITED");
    assert.equal(result.error.kind, "upstream");
    assert.equal(result.error.upstreamStatus, 429);
    assert.equal(JSON.stringify(result).includes("sensitive upstream detail"), false);
  }
});

test("returns validated structured output and bounded request settings", async () => {
  process.env.DEEPSEEK_API_KEY = "test-secret";
  delete process.env.DEEPSEEK_BASE_URL;
  delete process.env.DEEPSEEK_MODEL;

  globalThis.fetch = (async (input, init) => {
    assert.equal(String(input), "https://api.deepseek.com/chat/completions");
    assert.equal(init?.method, "POST");

    const headers = new Headers(init?.headers);
    assert.equal(headers.get("authorization"), "Bearer test-secret");

    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    assert.equal(body.model, "deepseek-flash");
    assert.equal(body.max_tokens, 256);
    assert.deepEqual(body.response_format, { type: "json_object" });

    return new Response(
      JSON.stringify({
        model: "deepseek-flash",
        choices: [
          {
            finish_reason: "stop",
            message: { content: '{"summary":"ok"}' },
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;

  const result = await callDeepSeek({
    task: "Summarize this.",
    context: "Untrusted repository text.",
    maxOutputTokens: 256,
    responseFormat: "json",
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.output.format, "json");
    if (result.output.format === "json") {
      assert.deepEqual(result.output.value, { summary: "ok" });
    }
    assert.deepEqual(result.usage, {
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
    });
  }
});
