import "server-only";

import { resolveDeepSeekConfig } from "./config";
import type {
  DeepSeekCallOptions,
  DeepSeekCallResult,
  DeepSeekError,
  DeepSeekRequest,
  DeepSeekUsage,
} from "./types";
import {
  MAX_OUTPUT_CHARACTERS,
  MAX_UPSTREAM_RESPONSE_BYTES,
  normalizeDeepSeekRequest,
  normalizeTimeout,
} from "./validation";

interface UpstreamResponse {
  model?: unknown;
  choices?: unknown;
  usage?: unknown;
}

function upstreamError(status: number): DeepSeekError {
  if (status === 401 || status === 403) {
    return {
      code: "AI_UPSTREAM_AUTH_ERROR",
      kind: "upstream",
      message: "DeepSeek 拒绝了服务端凭据。",
      retryable: false,
      upstreamStatus: status,
    };
  }

  if (status === 429) {
    return {
      code: "AI_UPSTREAM_RATE_LIMITED",
      kind: "upstream",
      message: "DeepSeek 请求频率或额度受限。",
      retryable: true,
      upstreamStatus: status,
    };
  }

  return {
    code: "AI_UPSTREAM_ERROR",
    kind: "upstream",
    message: "DeepSeek 服务返回了错误。",
    retryable: status >= 500,
    upstreamStatus: status,
  };
}

function invalidResponse(message: string): DeepSeekError {
  return {
    code: "AI_INVALID_RESPONSE",
    kind: "upstream",
    message,
    retryable: true,
  };
}

async function readBoundedBody(response: Response): Promise<string> {
  const contentLength = response.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_UPSTREAM_RESPONSE_BYTES) {
    throw new Error("response_too_large");
  }

  if (!response.body) {
    return "";
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    totalBytes += value.byteLength;
    if (totalBytes > MAX_UPSTREAM_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error("response_too_large");
    }
    text += decoder.decode(value, { stream: true });
  }

  return text + decoder.decode();
}

function parseUsage(value: unknown): DeepSeekUsage | undefined {
  if (typeof value !== "object" || value === null) return undefined;

  const usage = value as Record<string, unknown>;
  const promptTokens = usage.prompt_tokens;
  const completionTokens = usage.completion_tokens;
  const totalTokens = usage.total_tokens;

  if (
    typeof promptTokens !== "number" ||
    typeof completionTokens !== "number" ||
    typeof totalTokens !== "number"
  ) {
    return undefined;
  }

  return { promptTokens, completionTokens, totalTokens };
}

function parseChoice(value: unknown): { content: string; finishReason: string } | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;

  const choice = value[0];
  if (typeof choice !== "object" || choice === null) return undefined;

  const record = choice as Record<string, unknown>;
  const message = record.message;
  if (typeof message !== "object" || message === null) return undefined;

  const content = (message as Record<string, unknown>).content;
  const finishReason = record.finish_reason;
  if (typeof content !== "string" || typeof finishReason !== "string") return undefined;

  return { content, finishReason };
}

function combineAbortSignals(controller: AbortController, externalSignal: AbortSignal | undefined) {
  if (!externalSignal) return () => undefined;

  const abort = () => controller.abort(externalSignal.reason);
  if (externalSignal.aborted) {
    abort();
    return () => undefined;
  }

  externalSignal.addEventListener("abort", abort, { once: true });
  return () => externalSignal.removeEventListener("abort", abort);
}

export async function callDeepSeek(
  request: DeepSeekRequest,
  options: DeepSeekCallOptions = {},
): Promise<DeepSeekCallResult> {
  const configResolution = resolveDeepSeekConfig();
  if (configResolution.status === "disabled") {
    return {
      ok: false,
      error: {
        code: "AI_DISABLED",
        kind: "disabled",
        message: "DeepSeek 未配置；基础功能仍可继续使用。",
        retryable: false,
      },
    };
  }

  if (configResolution.status === "misconfigured") {
    return { ok: false, error: configResolution.error };
  }

  const normalizedRequest = normalizeDeepSeekRequest(request);
  if (normalizedRequest.ok === false) {
    return { ok: false, error: normalizedRequest.error };
  }

  const timeoutMs = normalizeTimeout(options.timeoutMs);
  if (typeof timeoutMs !== "number") {
    return { ok: false, error: timeoutMs };
  }

  const { config } = configResolution;
  const endpoint = `${config.baseUrl}/chat/completions`;
  const controller = new AbortController();
  const removeExternalAbortListener = combineAbortSignals(controller, options.signal);
  const timeout = setTimeout(() => controller.abort("timeout"), timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        messages: normalizedRequest.value.messages,
        max_tokens: normalizedRequest.value.maxOutputTokens,
        response_format:
          normalizedRequest.value.responseFormat === "json"
            ? { type: "json_object" }
            : { type: "text" },
        stream: false,
      }),
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      return { ok: false, error: upstreamError(response.status) };
    }

    let rawBody: string;
    try {
      rawBody = await readBoundedBody(response);
    } catch {
      return {
        ok: false,
        error: invalidResponse("DeepSeek 响应超过了允许的大小。"),
      };
    }

    let body: UpstreamResponse;
    try {
      body = JSON.parse(rawBody) as UpstreamResponse;
    } catch {
      return { ok: false, error: invalidResponse("DeepSeek 返回了无效 JSON。") };
    }

    const choice = parseChoice(body.choices);
    if (!choice || typeof body.model !== "string") {
      return { ok: false, error: invalidResponse("DeepSeek 响应缺少必需字段。") };
    }

    if (choice.content.length > MAX_OUTPUT_CHARACTERS) {
      return { ok: false, error: invalidResponse("DeepSeek 输出超过了允许的长度。") };
    }

    if (normalizedRequest.value.responseFormat === "json") {
      let value: unknown;
      try {
        value = JSON.parse(choice.content) as unknown;
      } catch {
        return { ok: false, error: invalidResponse("DeepSeek 未返回有效的结构化 JSON。") };
      }

      return {
        ok: true,
        output: { format: "json", text: choice.content, value },
        model: body.model,
        finishReason: choice.finishReason,
        usage: parseUsage(body.usage),
      };
    }

    return {
      ok: true,
      output: { format: "text", text: choice.content },
      model: body.model,
      finishReason: choice.finishReason,
      usage: parseUsage(body.usage),
    };
  } catch (error) {
    if (controller.signal.aborted) {
      return {
        ok: false,
        error: {
          code: "AI_TIMEOUT",
          kind: "timeout",
          message: options.signal?.aborted
            ? "DeepSeek 请求已取消。"
            : "DeepSeek 请求超时。",
          retryable: !options.signal?.aborted,
        },
      };
    }

    void error;
    return {
      ok: false,
      error: {
        code: "AI_NETWORK_ERROR",
        kind: "upstream",
        message: "无法连接 DeepSeek 服务。",
        retryable: true,
      },
    };
  } finally {
    clearTimeout(timeout);
    removeExternalAbortListener();
  }
}
