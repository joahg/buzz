import assert from "node:assert/strict";
import test from "node:test";

import { readUserActivity, recordUserActivity } from "./userActivity.ts";

const ME = "a".repeat(64);
const OTHER = "b".repeat(64);

function withLocalStorage(run) {
  const stored = new Map();
  globalThis.localStorage = {
    getItem: (key) => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, value),
  };
  try {
    run(stored);
  } finally {
    delete globalThis.localStorage;
  }
}

test("recordUserActivity_roundTripsThroughStorage", () => {
  withLocalStorage(() => {
    recordUserActivity(ME, "chan-1", 1_000, 2_000);
    recordUserActivity(ME, "chan-2", 2_000, 2_000);
    assert.deepEqual(readUserActivity(ME), {
      "chan-1": 1_000,
      "chan-2": 2_000,
    });
  });
});

test("recordUserActivity_isScopedPerIdentity", () => {
  withLocalStorage(() => {
    recordUserActivity(ME, "chan-1", 1_000, 1_000);
    recordUserActivity(OTHER, "chan-2", 2_000, 2_000);
    assert.deepEqual(readUserActivity(ME), { "chan-1": 1_000 });
    assert.deepEqual(readUserActivity(OTHER), { "chan-2": 2_000 });
    assert.deepEqual(readUserActivity(null), {});
  });
});

test("recordUserActivity_neverMovesTimestampsBackward", () => {
  withLocalStorage(() => {
    recordUserActivity(ME, "chan-1", 5_000, 5_000);
    recordUserActivity(ME, "chan-1", 3_000, 5_000);
    assert.deepEqual(readUserActivity(ME), { "chan-1": 5_000 });
  });
});

test("recordUserActivity_ignoresTimestampsPastRetention", () => {
  withLocalStorage(() => {
    const now = 100 * 24 * 60 * 60 * 1_000;
    recordUserActivity(ME, "ancient", 1_000, now);
    assert.deepEqual(readUserActivity(ME), {});
  });
});

test("recordUserActivity_prunesEntriesPastRetention", () => {
  withLocalStorage(() => {
    const now = 100 * 24 * 60 * 60 * 1_000;
    recordUserActivity(ME, "old", 1_000, 1_000);
    recordUserActivity(ME, "fresh", now, now);
    assert.deepEqual(readUserActivity(ME), { fresh: now });
  });
});

test("recordUserActivity_withoutPubkeyIsANoOp", () => {
  withLocalStorage((stored) => {
    recordUserActivity(null, "chan-1", 1_000, 1_000);
    assert.equal(stored.size, 0);
  });
});

test("readUserActivity_ignoresMalformedStorage", () => {
  withLocalStorage((stored) => {
    const key = `buzz.devMode.userActivity.v2:${ME}`;
    stored.set(key, "not json");
    assert.deepEqual(readUserActivity(ME), {});
    stored.set(key, JSON.stringify(["nope"]));
    assert.deepEqual(readUserActivity(ME), {});
    stored.set(key, JSON.stringify({ ok: 5, bad: "x", worse: Number.NaN }));
    assert.deepEqual(readUserActivity(ME), { ok: 5 });
  });
});

test("readUserActivity_returnsEmptyWithoutLocalStorage", () => {
  assert.deepEqual(readUserActivity(ME), {});
});
