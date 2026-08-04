import type * as React from "react";

import { useAppShell } from "@/app/AppShellContext";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/shared/ui/context-menu";

/**
 * Right-click wrapper for navigator rows and channel tabs: force the channel
 * unread so it stays flagged after clicking in before being ready to deal
 * with it. Clears through the normal read path the next time the channel is
 * opened (or via cross-device read markers).
 */
export function DevMarkUnreadMenu({
  channelId,
  children,
}: {
  channelId: string;
  children: React.ReactNode;
}) {
  const { markChannelUnread } = useAppShell();
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="font-mono">
        <ContextMenuItem
          data-testid="dev-mode-mark-unread"
          onSelect={() => markChannelUnread(channelId)}
        >
          mark unread
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
