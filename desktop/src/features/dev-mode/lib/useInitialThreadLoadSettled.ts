import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import * as React from "react";

import {
  threadRepliesChannelKey,
  threadRepliesKey,
} from "@/features/messages/lib/messageQueryKeys";
import type { RelayEvent } from "@/shared/api/types";

/** A hung reply fetch must not hold the scroll pin hostage forever. */
const SETTLE_TIMEOUT_MS = 4_000;

/**
 * True once every inline thread subtree the transcript is going to render
 * for this channel has finished loading (or errored). The transcript keeps
 * its bottom scroll pin held until then, so the scroll position is computed
 * from the fully loaded content instead of the skeleton.
 *
 * Latched per channel: reply queries mounted later (scroll-up pagination
 * prepending older prompts) never flip a settled channel back, which would
 * otherwise re-yank the view to the bottom.
 */
export function useInitialThreadLoadSettled({
  channelId,
  messagesReady,
  windowReady,
  roots,
  replyCounts,
}: {
  channelId: string;
  messagesReady: boolean;
  windowReady: boolean;
  roots: readonly RelayEvent[];
  replyCounts: ReadonlyMap<string, number>;
}): boolean {
  const queryClient = useQueryClient();
  // Reactivity signal: re-check whenever any of this channel's thread-reply
  // fetches starts or finishes.
  const repliesFetching = useIsFetching({
    queryKey: threadRepliesChannelKey(channelId),
  });
  const [settledFor, setSettledFor] = React.useState<string | null>(null);
  const settled = settledFor === channelId;

  React.useEffect(() => {
    if (settled) return;
    const timer = setTimeout(() => setSettledFor(channelId), SETTLE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [channelId, settled]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: repliesFetching is the intentional re-check signal
  React.useEffect(() => {
    if (settled || !messagesReady || !windowReady) return;
    const allLoaded = roots.every((root) => {
      if ((replyCounts.get(root.id) ?? 0) === 0) return true;
      const state = queryClient.getQueryState(
        threadRepliesKey(channelId, root.id),
      );
      // Undefined means the inline-replies card has not mounted its query
      // yet — still loading. "pending" is a mounted query without data.
      // A cached success can still be refetching (staleTime 0 on revisit),
      // and that refetch may resize the transcript — wait for idle too.
      return (
        state !== undefined &&
        state.status !== "pending" &&
        state.fetchStatus === "idle"
      );
    });
    if (allLoaded) setSettledFor(channelId);
  }, [
    channelId,
    messagesReady,
    windowReady,
    queryClient,
    replyCounts,
    repliesFetching,
    roots,
    settled,
  ]);

  return settled;
}
