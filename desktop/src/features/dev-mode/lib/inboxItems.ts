import type { SubChannelIndex } from "@/features/dev-mode/lib/subChannels";
import type { UserActivityMap } from "@/features/dev-mode/lib/userActivity";
import type { Channel } from "@/shared/api/types";

/**
 * Inbox selection: channel families the user sent into within the window,
 * one row per family (agent sessions map to channels, not threads). Pure
 * for unit tests.
 */

export const INBOX_WINDOW_MS = 24 * 60 * 60 * 1_000;

export type InboxItem = {
  main: Channel;
  /** Family channel with the newest activity — where the session lives. */
  target: Channel;
  /** Unix ms of the user's most recent send anywhere in the family. */
  myLastActiveAt: number;
};

export function selectInboxItems(
  subIndex: SubChannelIndex,
  activity: UserActivityMap,
  now: number,
): InboxItem[] {
  const items: InboxItem[] = [];
  for (const main of subIndex.mains) {
    const family = [main, ...(subIndex.subsByParentId.get(main.id) ?? [])];
    let myLastActiveAt = 0;
    let target = main;
    let targetActivity = Date.parse(main.lastMessageAt ?? "");
    for (const channel of family) {
      const sentAt = activity[channel.id] ?? 0;
      if (sentAt > myLastActiveAt) myLastActiveAt = sentAt;
      const channelActivity = Date.parse(channel.lastMessageAt ?? "");
      if (
        Number.isFinite(channelActivity) &&
        !(channelActivity <= targetActivity)
      ) {
        target = channel;
        targetActivity = channelActivity;
      }
    }
    if (myLastActiveAt === 0 || now - myLastActiveAt > INBOX_WINDOW_MS) {
      continue;
    }
    items.push({ main, target, myLastActiveAt });
  }
  return items.sort((a, b) => b.myLastActiveAt - a.myLastActiveAt);
}
