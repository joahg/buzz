import assert from "node:assert/strict";
import test from "node:test";

import { selectUnreadThreadRoots } from "./unreadThreads.ts";

function summary(lastReplyAt) {
  return {
    replyCount: 1,
    descendantCount: 1,
    lastReplyAt,
    participantPubkeys: [],
  };
}

test("selectUnreadThreadRoots_flagsRepliesPastTheReadFrontier", () => {
  const summaries = new Map([
    ["seen", summary(100)],
    ["unseen", summary(200)],
    ["never-read", summary(50)],
    ["no-replies", summary(null)],
  ]);
  const readAts = new Map([
    ["seen", 100],
    ["unseen", 150],
  ]);
  const unread = selectUnreadThreadRoots(
    summaries,
    (rootId) => readAts.get(rootId) ?? null,
  );
  assert.deepEqual([...unread].sort(), ["never-read", "unseen"]);
});
