import "server-only";

import type { DeepSeekAvailability, DeepSeekError } from "./types";

const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-flash";
const MAX_API_KEY_LENGTH = 4_096;
const MAX_BASE_URL_LENGTH = 2_048;
const MAX_MODEL_LENGTH = 128;
const MODEL_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/;

interface DeepSeekConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

type DeepSeekConfigResolution =
  | { status: "available"; config: DeepSeekConfig }
  | { status: "disabled" }
  | { status: "misconfigured"; error: DeepSeekError };

function configurationError(message: string): DeepSeekError {
  return {
    code: "AI_CONFIGURATION_ERROR",
    kind: "configuration",
    message,
    retryable: false,
  };
}

function normalizeBaseUrl(rawValue: string | undefined): string | DeepSeekError {
  const value = rawValue?.trim() || DEFAULT_BASE_URL;

  if (value.length > MAX_BASE_URL_LENGTH) {
    return configurationError("DeepSeek Base URL 过长。");
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return configurationError("DeepSeek Base URL 不是有效 URL。");
  }

  const isLocalHttp =
    url.protocol === "http:" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]");

  if (url.protocol !== "https:" && !isLocalHttp) {
    return configurationError("DeepSeek Base URL 必须使用 HTTPS（本机回环地址除外）。");
  }

  if (url.username || url.password || url.search || url.hash) {
    return configurationError("DeepSeek Base URL 不能包含凭据、查询参数或片段。");
  }

  url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString().replace(/\/$/, "");
}

export function resolveDeepSeekConfig(
  env: NodeJS.ProcessEnv = process.env,
): DeepSeekConfigResolution {
  const apiKey = env.DEEPSEEK_API_KEY?.trim();

  if (!apiKey) {
    return { status: "disabled" };
  }

  if (apiKey.length > MAX_API_KEY_LENGTH) {
    return {
      status: "misconfigured",
      error: configurationError("DeepSeek API Key 格式无效。"),
    };
  }

  const baseUrl = normalizeBaseUrl(env.DEEPSEEK_BASE_URL);
  if (typeof baseUrl !== "string") {
    return { status: "misconfigured", error: baseUrl };
  }

  const model = env.DEEPSEEK_MODEL?.trim() || DEFAULT_MODEL;
  if (model.length > MAX_MODEL_LENGTH || !MODEL_PATTERN.test(model)) {
    return {
      status: "misconfigured",
      error: configurationError("DeepSeek 模型名格式无效。"),
    };
  }

  return {
    status: "available",
    config: { apiKey, baseUrl, model },
  };
}

export function getDeepSeekAvailability(): DeepSeekAvailability {
  const resolution = resolveDeepSeekConfig();

  if (resolution.status === "disabled") {
    return { status: "disabled", reason: "missing_api_key" };
  }

  if (resolution.status === "misconfigured") {
    return { status: "misconfigured", error: resolution.error };
  }

  return {
    status: "available",
    baseUrl: resolution.config.baseUrl,
    model: resolution.config.model,
  };
}
