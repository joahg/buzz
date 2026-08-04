import assert from "node:assert/strict";
import test from "node:test";

import { INBOX_WINDOW_MS, selectInboxItems } from "./inboxItems.ts";

function channel(id, name, lastMessageAt = null) {
  return { id, name, lastMessageAt };
}

function subIndex(mains, subsByParentId = new Map()) {
  return { mains, subsByParentId, parentIdByChildId: new Map() };
}

const NOW = Date.parse("2026-08-04T12:00:00Z");

test("selectInboxItems_keepsOnlyFamiliesTheUserSentIntoWithin24h", () => {
  const items = selectInboxItems(
    subIndex([
      channel("recent", "recent"),
      channel("stale", "stale"),
      channel("silent", "silent"),
    ]),
    {
      recent: NOW - 60_000,
      stale: NOW - INBOX_WINDOW_MS - 1,
    },
    NOW,
  );
  assert.deepEqual(
    items.map((item) => item.main.id),
    ["recent"],
  );
});

test("selectInboxItems_countsSubChannelSendsTowardTheFamily", () => {
  const main = channel("m", "work");
  const sub = channel("m-sub", "work--tab");
  const items = selectInboxItems(
    subIndex([main], new Map([["m", [sub]]])),
    { "m-sub": NOW - 5_000 },
    NOW,
  );
  assert.equal(items.length, 1);
  assert.equal(items[0].main.id, "m");
  assert.equal(items[0].myLastActiveAt, NOW - 5_000);
});

test("selectInboxItems_targetsTheFamilyChannelWithNewestActivity", () => {
  const main = channel("m", "work", "2026-08-04T08:00:00Z");
  const sub = channel("m-sub", "work--tab", "2026-08-04T11:00:00Z");
  const items = selectInboxItems(
    subIndex([main], new Map([["m", [sub]]])),
    { m: NOW - 1_000 },
    NOW,
  );
  assert.equal(items[0].target.id, "m-sub");
});

test("selectInboxItems_sortsByMyMostRecentSend", () => {
  const items = selectInboxItems(
    subIndex([channel("a", "a"), channel("b", "b")]),
    { a: NOW - 10_000, b: NOW - 1_000 },
    NOW,
  );
  assert.deepEqual(
    items.map((item) => item.main.id),
    ["b", "a"],
  );
});
