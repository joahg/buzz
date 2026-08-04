import * as React from "react";

import {
  type InboxItem,
  selectInboxItems,
} from "@/features/dev-mode/lib/inboxItems";
import type { SubChannelIndex } from "@/features/dev-mode/lib/subChannels";
import { readUserActivity } from "@/features/dev-mode/lib/userActivity";
import type { Channel } from "@/shared/api/types";
import { cn } from "@/shared/lib/cn";

function formatRelativeTime(unixMs: number) {
  const deltaSeconds = Math.max(0, Math.floor((Date.now() - unixMs) / 1_000));
  if (deltaSeconds < 60) return "now";
  if (deltaSeconds < 3_600) return `${Math.floor(deltaSeconds / 60)}m`;
  return `${Math.floor(deltaSeconds / 3_600)}h`;
}

function InboxRow({
  item,
  status,
  isUnread,
  onOpen,
  onSend,
}: {
  item: InboxItem;
  status: string | undefined;
  isUnread: boolean;
  onOpen: (channelId: string) => void;
  onSend: (target: Channel, text: string) => Promise<void>;
}) {
  const [draft, setDraft] = React.useState("");
  const [state, setState] = React.useState<"idle" | "sending" | "sent">("idle");

  const submit = () => {
    const text = draft.trim();
    if (!text || state === "sending") return;
    setState("sending");
    void onSend(item.target, text)
      .then(() => {
        setDraft("");
        setState("sent");
        setTimeout(() => setState("idle"), 2_000);
      })
      .catch(() => setState("idle"));
  };

  return (
    <div
      className="border-b border-border/40 px-3 py-2"
      data-testid="dev-mode-inbox-row"
    >
      <div className="flex items-baseline gap-2">
        <button
          className={cn(
            "min-w-0 cursor-pointer truncate text-left text-sm hover:underline",
            isUnread ? "font-semibold text-foreground" : "text-foreground",
          )}
          onClick={() => onOpen(item.target.id)}
          type="button"
        >
          # {item.main.name}
        </button>
        {isUnread ? (
          <span
            aria-label="unread"
            className="shrink-0 self-center text-3xs leading-none text-muted-foreground/60"
            role="img"
          >
            ●
          </span>
        ) : null}
        <span className="ml-auto shrink-0 text-xs text-muted-foreground/60">
          {formatRelativeTime(item.myLastActiveAt)}
        </span>
      </div>
      {status ? (
        <div
          className="truncate pt-0.5 text-xs text-muted-foreground/70"
          data-testid="dev-mode-inbox-status"
        >
          {status}
        </div>
      ) : null}
      <div className="flex items-center gap-2 pt-1.5">
        <input
          className="min-w-0 flex-1 border border-border/60 bg-background px-2 py-1 text-xs text-foreground outline-none placeholder:text-muted-foreground/40 focus:border-primary/60"
          data-testid="dev-mode-inbox-input"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder={`message # ${item.target.name}…`}
          value={draft}
        />
        <span className="w-8 shrink-0 text-xs text-muted-foreground/60">
          {state === "sending" ? "…" : state === "sent" ? "sent" : ""}
        </span>
      </div>
    </div>
  );
}

/**
 * Channel-focused inbox: the families the user sent into within the past
 * 24h, newest first, each with its short status line and a quick composer
 * to unblock the session without opening it. Agent sessions map to
 * channels (not threads), so rows are channel families and quick replies
 * land in the family channel with the newest activity.
 */
export function DevInbox({
  subIndex,
  statuses,
  unreadMainIds,
  myPubkey,
  onOpenChannel,
  onSend,
  onClose,
}: {
  subIndex: SubChannelIndex;
  statuses: ReadonlyMap<string, string>;
  unreadMainIds: ReadonlySet<string>;
  myPubkey: string | null;
  onOpenChannel: (channelId: string) => void;
  onSend: (target: Channel, text: string) => Promise<void>;
  onClose: () => void;
}) {
  const panelRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    panelRef.current?.focus();
  }, []);

  const items = React.useMemo(
    () => selectInboxItems(subIndex, readUserActivity(myPubkey), Date.now()),
    [myPubkey, subIndex],
  );

  return (
    <div className="absolute inset-0 z-50 flex items-start justify-center bg-background/60 pt-[8vh] font-mono">
      <div aria-hidden className="absolute inset-0" onClick={onClose} />
      <div
        ref={panelRef}
        aria-label="Inbox"
        className="relative flex max-h-[75vh] w-[640px] flex-col border border-border bg-background shadow-lg outline-none"
        data-testid="dev-mode-inbox"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            onClose();
          }
        }}
        role="dialog"
        tabIndex={-1}
      >
        <div className="flex shrink-0 items-baseline justify-between border-b border-border/60 px-3 py-2 text-sm">
          <span className="text-foreground">inbox · active last 24h</span>
          <button
            className="cursor-pointer text-xs text-muted-foreground hover:text-foreground"
            onClick={onClose}
            type="button"
          >
            close
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {items.length === 0 ? (
            <div className="px-3 py-4 text-sm text-muted-foreground/60">
              nothing yet — channels you send into show up here for 24h
            </div>
          ) : (
            items.map((item) => (
              <InboxRow
                key={item.main.id}
                isUnread={unreadMainIds.has(item.main.id)}
                item={item}
                onOpen={(channelId) => {
                  onOpenChannel(channelId);
                  onClose();
                }}
                onSend={onSend}
                status={statuses.get(item.main.id)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
