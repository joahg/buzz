import type { PendingEvent } from "@/shared/api/relayClientShared";
import {
  MAX_PUBLISH_RATE_LIMIT_RETRIES,
  PUBLISH_TIMEOUT_MS,
} from "@/shared/api/relayClientTimings";
import { waitForRateLimit } from "@/shared/api/relayRateLimitGate";
import type { RelayEvent } from "@/shared/api/types";

export type RelayPublisherDeps = {
  pendingEvents: Map<string, PendingEvent>;
  sendEvent: (event: RelayEvent) => Promise<void>;
  ensureConnected: () => Promise<void>;
  recoverFromSocketFailure: (error: unknown, fallbackMessage: string) => Error;
};

/**
 * Owns the publish lifecycle for relay EVENT frames: the pending-OK map
 * entry, the publish timeout, the reconnect re-send, and the rate-limit
 * re-send.
 *
 * The rate-limit path exists because the relay drops an admission-rejected
 * EVENT with only an uncorrelated `rate-limited:` NOTICE — no OK ever
 * arrives, so without a retry the publish silently burns the full publish
 * timeout and fails, even though the relay accepts duplicate re-sends
 * idempotently (`OK true "duplicate:"`).
 */
export function createRelayPublisher(deps: RelayPublisherDeps) {
  let retryInFlight = false;

  return {
    async publish(
      event: RelayEvent,
      timeoutMessage: string,
      sendErrorMessage: string,
    ): Promise<RelayEvent> {
      // Await the gate before sending EVENT; op timeout starts after the wait.
      await waitForRateLimit();

      return new Promise<RelayEvent>((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          deps.pendingEvents.delete(event.id);
          reject(new Error(timeoutMessage));
        }, PUBLISH_TIMEOUT_MS);

        deps.pendingEvents.set(event.id, {
          event,
          resolve,
          reject,
          timeout,
          timeoutMessage,
          rateLimitRetries: 0,
        });

        void deps.sendEvent(event).catch(async (error) => {
          const pendingEvent = deps.pendingEvents.get(event.id);
          deps.pendingEvents.delete(event.id);
          const normalizedError = deps.recoverFromSocketFailure(
            error,
            sendErrorMessage,
          );

          try {
            await deps.ensureConnected();
            if (!pendingEvent) {
              throw normalizedError;
            }

            deps.pendingEvents.set(event.id, pendingEvent);
            await deps.sendEvent(event);
          } catch (retryError) {
            window.clearTimeout(timeout);
            deps.pendingEvents.delete(event.id);
            reject(
              deps.recoverFromSocketFailure(
                retryError,
                normalizedError.message,
              ),
            );
          }
        });
      });
    },

    /**
     * Re-send every pending event once the rate-limit gate clears, each with
     * a fresh timeout, capped per event so a persistently saturated
     * connection still fails instead of looping. One pass runs at a time;
     * the gate's shared expiry means overlapping NOTICEs collapse into it.
     *
     * @param stillValid Checked after the gate clears; a reconnect while
     * gated already rejected all pending events, so a stale connection
     * generation must not re-send.
     */
    retryAfterRateLimit(stillValid: () => boolean): void {
      if (retryInFlight || deps.pendingEvents.size === 0) {
        return;
      }
      retryInFlight = true;
      void (async () => {
        try {
          await waitForRateLimit();
          if (!stillValid()) {
            return;
          }
          for (const [eventId, pending] of deps.pendingEvents) {
            if (pending.rateLimitRetries >= MAX_PUBLISH_RATE_LIMIT_RETRIES) {
              continue;
            }
            pending.rateLimitRetries += 1;
            window.clearTimeout(pending.timeout);
            pending.timeout = window.setTimeout(() => {
              deps.pendingEvents.delete(eventId);
              pending.reject(new Error(pending.timeoutMessage));
            }, PUBLISH_TIMEOUT_MS);
            // A send failure here falls back to the fresh timeout; the
            // reconnect path rejects pending events on connection reset.
            void deps.sendEvent(pending.event).catch(() => {});
          }
        } finally {
          retryInFlight = false;
        }
      })();
    },
  };
}
