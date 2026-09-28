export type IdempotencyRecord = {
  operationId: string;
  requestFingerprint: string;
  responseJson: string;
  createdAt: string;
};

export type IdempotencyDecision =
  | { kind: "execute" }
  | { kind: "replay"; responseJson: string }
  | { kind: "reject"; code: "IDEMPOTENCY_KEY_REUSED" };

export function decideIdempotency(
  existing: IdempotencyRecord | null,
  operationId: string,
  requestFingerprint: string,
): IdempotencyDecision {
  if (!existing) return { kind: "execute" };
  if (existing.operationId !== operationId || existing.requestFingerprint !== requestFingerprint) {
    return { kind: "reject", code: "IDEMPOTENCY_KEY_REUSED" };
  }
  return { kind: "replay", responseJson: existing.responseJson };
}
