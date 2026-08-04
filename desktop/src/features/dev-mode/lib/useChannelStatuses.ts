import * as React from "react";

import {
  channelStatusStore,
  generateChannelStatus,
  selectStatusTargets,
  type StatusTarget,
  statusIsFresh,
} from "@/features/dev-mode/lib/channelStatus";
import type { SubChannelIndex } from "@/features/dev-mode/lib/subChannels";
import { recordUserActivity } from "@/features/dev-mode/lib/userActivity";
import { useManagedAgentsQuery } from "@/features/agents/hooks";
import { getChannelWindowEvents } from "@/shared/api/channelWindow";
import type { RelayEvent } from "@/shared/api/types";
import { normalizePubkey } from "@/shared/lib/pubkey";

/** Let a burst of agent output settle before summarizing it. */
const ACTIVITY_DEBOUNCE_MS = 10_000;
/** Floor between regenerations of the same channel. */
const REGENERATE_MIN_INTERVAL_MS = 60_000;
const WINDOW_ROWS = 30;

/**
 * Best-effort short status lines per main channel, keyed by main id.
 * Serves cached lines immediately and regenerates stale ones for recently
 * active families — one at a time, debounced past active bursts, never
 * blocking anything.
 */
export function useChannelStatuses(
  subIndex: SubChannelIndex,
  myPubkey: string | null,
): ReadonlyMap<string, string> {
  const managedAgentsQuery = useManagedAgentsQuery();
  const agentPubkey = managedAgentsQuery.data?.[0]?.pubkey ?? null;

  const cacheRef = React.useRef<ReturnType<
    typeof channelStatusStore.read
  > | null>(null);
  if (cacheRef.current === null) {
    cacheRef.current = channelStatusStore.read();
  }
  const cache = cacheRef.current;
  const [version, setVersion] = React.useState(0);
  const runningRef = React.useRef(false);
  const attemptedAtRef = React.useRef(new Map<string, number>());

  const targets = React.useMemo(
    () =>
      selectStatusTargets(subIndex.mains, subIndex.subsByParentId, Date.now()),
    [subIndex],
  );

  // The in-flight generation reads these instead of its closure so a result
  // that lands after unmount or after the target moved on is dropped.
  const mountedRef = React.useRef(true);
  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const targetsRef = React.useRef(targets);
  targetsRef.current = targets;
  const myPubkeyRef = React.useRef(myPubkey);
  myPubkeyRef.current = myPubkey;

  // biome-ignore lint/correctness/useExhaustiveDependencies: version re-arms the effect after each completed generation
  React.useEffect(() => {
    if (runningRef.current) return;
    const now = Date.now();
    let wakeAt = Number.POSITIVE_INFINITY;
    let next: StatusTarget | null = null;
    for (const target of targets) {
      if (statusIsFresh(cache[target.mainId], target.activityAt)) continue;
      const attemptedAt = attemptedAtRef.current.get(target.mainId) ?? 0;
      const eligibleAt = Math.max(
        Date.parse(target.activityAt) + ACTIVITY_DEBOUNCE_MS,
        attemptedAt + REGENERATE_MIN_INTERVAL_MS,
      );
      if (eligibleAt > now) {
        wakeAt = Math.min(wakeAt, eligibleAt);
        continue;
      }
      next = target;
      break;
    }
    if (!next) {
      if (Number.isFinite(wakeAt)) {
        const timer = setTimeout(
          () => setVersion((value) => value + 1),
          Math.max(250, wakeAt - now),
        );
        return () => clearTimeout(timer);
      }
      return;
    }

    const target = next;
    runningRef.current = true;
    attemptedAtRef.current.set(target.mainId, now);
    void (async () => {
      try {
        const events = await getChannelWindowEvents(
          target.sourceChannelId,
          null,
          WINDOW_ROWS,
        );
        recordObservedSelfActivity(
          myPubkeyRef.current,
          target.sourceChannelId,
          events,
        );
        const result = await generateChannelStatus(events, agentPubkey);
        // Drop stale results: the hook unmounted, or the family moved to a
        // different source channel while we were generating. Newer activity
        // in the same source still commits — the entry stays keyed to the
        // activityAt it summarized, so it reads as stale and regenerates.
        const current = targetsRef.current.find(
          (candidate) => candidate.mainId === target.mainId,
        );
        const relevant =
          mountedRef.current &&
          current?.sourceChannelId === target.sourceChannelId;
        if (result && relevant) {
          cache[target.mainId] = {
            status: result.status,
            activityAt: target.activityAt,
            generatedAt: Date.now(),
            fallback: result.fallback || undefined,
          };
          channelStatusStore.write(cache);
        }
      } catch {
        // Window fetch failed; the attempt timestamp already rate-limits.
      } finally {
        runningRef.current = false;
        if (mountedRef.current) setVersion((value) => value + 1);
      }
    })();
  }, [agentPubkey, cache, targets, version]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: version tracks cache mutations
  return React.useMemo(() => {
    const map = new Map<string, string>();
    for (const [mainId, entry] of Object.entries(cache)) {
      map.set(mainId, entry.status);
    }
    return map;
  }, [cache, version]);
}

/**
 * Seed the Inbox's activity record from self-authored events in a fetched
 * window, so channels the user was active in before this feature existed
 * (or from another device) still surface. recordUserActivity only moves
 * timestamps forward, so re-observing old events is harmless.
 */
function recordObservedSelfActivity(
  myPubkey: string | null,
  channelId: string,
  events: readonly RelayEvent[],
): void {
  if (!myPubkey) return;
  const me = normalizePubkey(myPubkey);
  let latest = 0;
  for (const event of events) {
    if (event.created_at > latest && normalizePubkey(event.pubkey) === me) {
      latest = event.created_at;
    }
  }
  if (latest > 0) recordUserActivity(myPubkey, channelId, latest * 1_000);
}
