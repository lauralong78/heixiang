export const FORMAL_BOARD_POLL_INTERVAL_MS = 8_000;
export type SyncState = "idle" | "syncing" | "synced" | "stale" | "failed";

export function isCurrentPoll(requestId: number, latestRequestId: number) {
  return requestId === latestRequestId;
}

export function syncLabel(state: SyncState) {
  return ({ idle: "尚未同步", syncing: "同步中…", synced: "已同步", stale: "数据可能过期", failed: "同步失败" } as const)[state];
}
