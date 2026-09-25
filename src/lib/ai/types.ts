export type DeepSeekMessageRole = "system" | "user" | "assistant";

export interface DeepSeekMessage {
  role: DeepSeekMessageRole;
  content: string;
}

interface DeepSeekRequestOptions {
  /** Hard-capped by the adapter. */
  maxOutputTokens?: number;
  responseFormat?: "text" | "json";
}

export interface DeepSeekMessagesRequest extends DeepSeekRequestOptions {
  messages: readonly DeepSeekMessage[];
  task?: never;
  context?: never;
  systemInstruction?: never;
}

export interface DeepSeekTaskRequest extends DeepSeekRequestOptions {
  task: string;
  context?: string;
  systemInstruction?: string;
  messages?: never;
}

export type DeepSeekRequest = DeepSeekMessagesRequest | DeepSeekTaskRequest;

export type DeepSeekAvailability =
  | {
      status: "available";
      baseUrl: string;
      model: string;
    }
  | {
      status: "disabled";
      reason: "missing_api_key";
    }
  | {
      status: "misconfigured";
      error: DeepSeekError;
    };

export type DeepSeekErrorKind =
  | "disabled"
  | "configuration"
  | "input"
  | "timeout"
  | "upstream";

export interface DeepSeekError {
  code:
    | "AI_DISABLED"
    | "AI_CONFIGURATION_ERROR"
    | "AI_INPUT_INVALID"
    | "AI_TIMEOUT"
    | "AI_NETWORK_ERROR"
    | "AI_UPSTREAM_AUTH_ERROR"
    | "AI_UPSTREAM_RATE_LIMITED"
    | "AI_UPSTREAM_ERROR"
    | "AI_INVALID_RESPONSE";
  kind: DeepSeekErrorKind;
  message: string;
  retryable: boolean;
  /** Present only for an HTTP error returned by DeepSeek. */
  upstreamStatus?: number;
}

export type DeepSeekOutput =
  | { format: "text"; text: string }
  | { format: "json"; text: string; value: unknown };

export interface DeepSeekUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export type DeepSeekCallResult =
  | {
      ok: true;
      output: DeepSeekOutput;
      model: string;
      finishReason: string;
      usage?: DeepSeekUsage;
    }
  | {
      ok: false;
      error: DeepSeekError;
    };

export interface DeepSeekCallOptions {
  /** Per-call deadline. Values outside the adapter bounds are rejected. */
  timeoutMs?: number;
  signal?: AbortSignal;
}
