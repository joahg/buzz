/**
 * Local record of when the user last sent something into each channel —
 * feeds the Inbox's "channels I've been active in recently" filter. Written
 * on every dev-mode send (prompts, side chats, quick replies) and seeded
 * from self-authored events observed in fetched channel windows, so the
 * Inbox also knows about activity from before this feature (or from other
 * devices). Per-identity like the forced-unread store; best-effort.
 */

const STORAGE_PREFIX = "buzz.devMode.userActivity.v2";
/** Entries older than this are pruned on write; the Inbox looks back 24h. */
const RETENTION_MS = 7 * 24 * 60 * 60 * 1_000;

const storageKey = (pubkey: string) => `${STORAGE_PREFIX}:${pubkey}`;

/** channelId → unix ms of the user's last send into it. */
export type UserActivityMap = Record<string, number>;

export function readUserActivity(pubkey: string | null): UserActivityMap {
  if (!pubkey) return {};
  try {
    const raw = globalThis.localStorage?.getItem(storageKey(pubkey));
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
      return {};
    const result: UserActivityMap = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "number" && Number.isFinite(value)) {
        result[key] = value;
      }
    }
    return result;
  } catch {
    return {};
  }
}

/**
 * Record a send (or an observed self-authored event) into a channel.
 * Timestamps only move forward, so replaying an old observed event never
 * regresses a fresher local send.
 */
export function recordUserActivity(
  pubkey: string | null,
  channelId: string,
  at = Date.now(),
  now = Date.now(),
): void {
  if (!pubkey) return;
  try {
    const map = readUserActivity(pubkey);
    if (now - at > RETENTION_MS) return;
    if (at <= (map[channelId] ?? 0)) return;
    map[channelId] = at;
    for (const [key, value] of Object.entries(map)) {
      if (now - value > RETENTION_MS) delete map[key];
    }
    globalThis.localStorage?.setItem(storageKey(pubkey), JSON.stringify(map));
  } catch {
    // Best-effort; the Inbox just sees less history.
  }
}
