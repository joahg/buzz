import type { ChannelWindowThreadSummary } from "@/features/messages/lib/channelWindowStore";

/**
 * Roots whose thread has replies past the shared read frontier. Built from
 * the same window summaries the transcript renders reply counts from, so
 * the per-card unread dot always agrees with what is on screen.
 */
export function selectUnreadThreadRoots(
  summaries: ReadonlyMap<string, ChannelWindowThreadSummary>,
  getThreadReadAt: (rootId: string) => number | null,
): ReadonlySet<string> {
  const unread = new Set<string>();
  for (const [rootId, summary] of summaries) {
    if (!summary.lastReplyAt) continue;
    const readAt = getThreadReadAt(rootId);
    if (readAt === null || summary.lastReplyAt > readAt) {
      unread.add(rootId);
    }
  }
  return unread;
}
