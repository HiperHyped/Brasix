export const BRASIX_SYNC_KEY = "brasix:v1-sync-token";

export function broadcastSync(reason) {
  localStorage.setItem(
    BRASIX_SYNC_KEY,
    JSON.stringify({
      reason,
      at: Date.now(),
    }),
  );
}

export function readSyncToken() {
  return localStorage.getItem(BRASIX_SYNC_KEY);
}
