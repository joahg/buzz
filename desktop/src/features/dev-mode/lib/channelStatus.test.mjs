import assert from "node:assert/strict";
import test from "node:test";

import {
  channelStatusStore,
  selectStatusTargets,
  snippetStatus,
  statusIsFresh,
  statusTranscript,
  toStatusLine,
} from "./channelStatus.ts";

function message(id, content, createdAt, pubkey = "a".repeat(64), kind = 9) {
  return { id, kind, content, created_at: createdAt, pubkey, tags: [] };
}

function channel(id, name, lastMessageAt = null) {
  return { id, name, lastMessageAt };
}

test("toStatusLine_trimsQuotesAndKeepsTheLastLine", () => {
  assert.equal(
    toStatusLine('Sure! Here is the status:\n"waiting on PR review"'),
    "waiting on PR review",
  );
});

test("toStatusLine_truncatesLongOutputWithEllipsis", () => {
  const line = toStatusLine("x".repeat(200));
  assert.equal(line?.length, 90);
  assert.ok(line?.endsWith("…"));
});

test("toStatusLine_rejectsEmptyAndTinyOutput", () => {
  assert.equal(toStatusLine(""), null);
  assert.equal(toStatusLine("  \n \n"), null);
  assert.equal(toStatusLine('"a"'), null);
});

test("statusTranscript_ordersOldestFirstAndSkipsNonChat", () => {
  const transcript = statusTranscript([
    message("2", "second", 200),
    {
      id: "x",
      kind: 7,
      content: "+",
      created_at: 300,
      pubkey: "b".repeat(64),
      tags: [],
    },
    message("1", "first\nwrapped", 100),
    message("3", "   ", 250),
  ]);
  const lines = transcript.split("\n");
  assert.equal(lines.length, 2);
  assert.ok(lines[0].endsWith("first wrapped"));
  assert.ok(lines[1].endsWith("second"));
});

test("statusTranscript_includesV2StreamMessages", () => {
  const transcript = statusTranscript([
    message("1", "legacy kind", 100),
    message("2", "v2 kind", 200, "b".repeat(64), 40002),
  ]);
  const lines = transcript.split("\n");
  assert.equal(lines.length, 2);
  assert.ok(lines[1].endsWith("v2 kind"));
});

test("snippetStatus_latestMessageWinsAcrossKinds", () => {
  assert.equal(
    snippetStatus([
      message("1", "older legacy", 100),
      message("2", "newest v2", 200, "b".repeat(64), 40002),
    ]),
    "newest v2",
  );
});

test("snippetStatus_usesTheLatestMessagesFirstNonEmptyLine", () => {
  assert.equal(
    snippetStatus([
      message("1", "older", 100),
      message("2", "\nnewest headline\nbody", 200),
    ]),
    "newest headline",
  );
  assert.equal(snippetStatus([]), null);
});

test("statusIsFresh_comparesFamilyActivityTimestamps", () => {
  const entry = {
    status: "s",
    activityAt: "2026-08-04T10:00:00Z",
    generatedAt: 1,
  };
  assert.equal(statusIsFresh(entry, "2026-08-04T10:00:00Z"), true);
  assert.equal(statusIsFresh(entry, "2026-08-04T11:00:00Z"), false);
  assert.equal(statusIsFresh(undefined, "2026-08-04T10:00:00Z"), false);
});

test("statusIsFresh_treatsEqualInstantsInDifferentFormatsAsFresh", () => {
  const entry = {
    status: "s",
    activityAt: "2026-08-04T10:00:00Z",
    generatedAt: 1,
  };
  // Backend "…00Z" vs live toISOString() "…00.000Z" — same instant.
  assert.equal(statusIsFresh(entry, "2026-08-04T10:00:00.000Z"), true);
  assert.equal(statusIsFresh(entry, "2026-08-04T10:00:00.001Z"), false);
});

test("selectStatusTargets_picksTheNewestFamilyChannelWithin24h", () => {
  const now = Date.parse("2026-08-04T12:00:00Z");
  const mainA = channel("a", "alpha", "2026-08-04T08:00:00Z");
  const subA = channel("a-sub", "alpha--sub", "2026-08-04T11:00:00Z");
  const mainB = channel("b", "beta", "2026-08-01T00:00:00Z");
  const mainC = channel("c", "gamma", null);
  const targets = selectStatusTargets(
    [mainA, mainB, mainC],
    new Map([["a", [subA]]]),
    now,
  );
  assert.deepEqual(targets, [
    {
      mainId: "a",
      sourceChannelId: "a-sub",
      activityAt: "2026-08-04T11:00:00Z",
    },
  ]);
});

test("selectStatusTargets_ordersNewestActivityFirst", () => {
  const now = Date.parse("2026-08-04T12:00:00Z");
  const targets = selectStatusTargets(
    [
      channel("old", "old", "2026-08-04T01:00:00Z"),
      channel("new", "new", "2026-08-04T11:00:00Z"),
    ],
    new Map(),
    now,
  );
  assert.deepEqual(
    targets.map((target) => target.mainId),
    ["new", "old"],
  );
});

test("channelStatusStore_roundTripsAndDropsMalformedEntries", () => {
  const stored = new Map();
  globalThis.localStorage = {
    getItem: (key) => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, value),
  };
  try {
    channelStatusStore.write({
      good: { status: "s", activityAt: "2026-08-04", generatedAt: 5 },
    });
    const raw = JSON.parse([...stored.values()][0]);
    raw.bad = { status: 42 };
    stored.set([...stored.keys()][0], JSON.stringify(raw));
    const read = channelStatusStore.read();
    assert.deepEqual(Object.keys(read), ["good"]);
    assert.equal(read.good.status, "s");

    stored.set([...stored.keys()][0], "not json");
    assert.deepEqual(channelStatusStore.read(), {});
  } finally {
    delete globalThis.localStorage;
  }
});

test("channelStatusStore_writePrunesTheMapItWasGiven", () => {
  const stored = new Map();
  globalThis.localStorage = {
    getItem: (key) => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, value),
  };
  try {
    const map = {};
    for (let i = 0; i < 305; i += 1) {
      map[`chan-${i}`] = { status: "s", activityAt: "x", generatedAt: i };
    }
    channelStatusStore.write(map);
    assert.equal(Object.keys(map).length, 300);
    // Oldest generatedAt entries were evicted from the live map too.
    assert.equal(map["chan-0"], undefined);
    assert.ok(map["chan-304"]);
    assert.equal(Object.keys(channelStatusStore.read()).length, 300);
  } finally {
    delete globalThis.localStorage;
  }
});
