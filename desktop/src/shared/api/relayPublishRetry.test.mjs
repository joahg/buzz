import assert from "node:assert/strict";
import test from "node:test";

// ── Fake-timer setup ──────────────────────────────────────────────────────────
// The publisher and the rate-limit gate use window.setTimeout/clearTimeout.
// Install a controllable fake before importing the modules under test.

let fakeNow = 0;
const pendingTimers = new Map(); // id → { fn, fireAt }
let nextTimerId = 1;

function fakeSetTimeout(fn, ms) {
  const id = nextTimerId++;
  pendingTimers.set(id, { fn, fireAt: fakeNow + ms });
  return id;
}

function fakeClearTimeout(id) {
  pendingTimers.delete(id);
}

function tickTo(ms) {
  fakeNow = ms;
  for (const [id, { fn, fireAt }] of Array.from(pendingTimers.entries())) {
    if (fireAt <= fakeNow) {
      pendingTimers.delete(id);
      fn();
    }
  }
}

globalThis.window = {
  setTimeout: fakeSetTimeout,
  clearTimeout: fakeClearTimeout,
};

function setFakeNow(ms) {
  fakeNow = ms;
  Date.now = () => fakeNow;
}

// Import after the window shim is installed.
const { createRelayPublisher } = await import("./relayPublishRetry.ts");
const { activateRateLimit, resetRateLimitGate } = await import(
  "./relayRateLimitGate.ts"
);
const { MAX_PUBLISH_RATE_LIMIT_RETRIES, PUBLISH_TIMEOUT_MS } = await import(
  "./relayClientTimings.ts"
);

/** Drain microtasks so awaited gate promises inside the publisher settle. */
function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

function reset(startMs = 0) {
  pendingTimers.clear();
  nextTimerId = 1;
  setFakeNow(startMs);
  resetRateLimitGate();
}

function makeEvent(id) {
  return { id, kind: 9, content: `event-${id}`, tags: [] };
}

/**
 * Build a publisher wired to a recording harness. `sends` records every
 * EVENT frame handed to the transport, in order.
 */
function makeHarness({ sendEvent } = {}) {
  const pendingEvents = new Map();
  const sends = [];
  const publisher = createRelayPublisher({
    pendingEvents,
    sendEvent:
      sendEvent ??
      ((event) => {
        sends.push(event.id);
        return Promise.resolve();
      }),
    ensureConnected: () => Promise.resolve(),
    recoverFromSocketFailure: (error, fallbackMessage) =>
      error instanceof Error ? error : new Error(fallbackMessage),
  });
  return { pendingEvents, sends, publisher };
}

// ── publish ───────────────────────────────────────────────────────────────────

test("publish sends the event and resolves when OK arrives", async () => {
  reset();
  const { pendingEvents, sends, publisher } = makeHarness();

  const event = makeEvent("e1");
  const result = publisher.publish(event, "timed out", "send failed");
  await flush();

  assert.deepEqual(sends, ["e1"]);
  const pending = pendingEvents.get("e1");
  assert.ok(pending);

  // Simulate the session's OK handling.
  window.clearTimeout(pending.timeout);
  pendingEvents.delete("e1");
  pending.resolve(event);

  assert.equal(await result, event);
});

test("publish rejects with the timeout message after PUBLISH_TIMEOUT_MS", async () => {
  reset();
  const { pendingEvents, publisher } = makeHarness();

  const rejection = assert.rejects(
    publisher.publish(makeEvent("e1"), "publish timed out", "send failed"),
    /publish timed out/,
  );
  await flush();

  tickTo(PUBLISH_TIMEOUT_MS);
  await rejection;
  assert.equal(pendingEvents.size, 0);
});

test("publish waits for an active rate-limit gate before sending", async () => {
  reset();
  const { sends, publisher } = makeHarness();

  activateRateLimit(4);
  void publisher.publish(makeEvent("e1"), "timed out", "send failed");
  await flush();
  assert.deepEqual(sends, []);

  tickTo(4_000);
  await flush();
  assert.deepEqual(sends, ["e1"]);
});

test("publish re-sends once after a socket failure and reconnect", async () => {
  reset();
  const pendingEvents = new Map();
  const sends = [];
  let failFirst = true;
  const publisher = createRelayPublisher({
    pendingEvents,
    sendEvent: (event) => {
      sends.push(event.id);
      if (failFirst) {
        failFirst = false;
        return Promise.reject(new Error("socket closed"));
      }
      return Promise.resolve();
    },
    ensureConnected: () => Promise.resolve(),
    recoverFromSocketFailure: (error, fallbackMessage) =>
      error instanceof Error ? error : new Error(fallbackMessage),
  });

  const event = makeEvent("e1");
  const result = publisher.publish(event, "timed out", "send failed");
  await flush();

  assert.deepEqual(sends, ["e1", "e1"]);
  const pending = pendingEvents.get("e1");
  assert.ok(pending, "pending entry restored after reconnect re-send");

  window.clearTimeout(pending.timeout);
  pendingEvents.delete("e1");
  pending.resolve(event);
  assert.equal(await result, event);
});

test("publish rejects when the reconnect re-send also fails", async () => {
  reset();
  const pendingEvents = new Map();
  const publisher = createRelayPublisher({
    pendingEvents,
    sendEvent: () => Promise.reject(new Error("socket closed")),
    ensureConnected: () => Promise.resolve(),
    recoverFromSocketFailure: (error, fallbackMessage) =>
      error instanceof Error ? error : new Error(fallbackMessage),
  });

  await assert.rejects(
    publisher.publish(makeEvent("e1"), "timed out", "send failed"),
    /socket closed/,
  );
  assert.equal(pendingEvents.size, 0);
});

// ── retryAfterRateLimit ───────────────────────────────────────────────────────

test("dropped publish is re-sent after the gate expires", async () => {
  reset();
  const { pendingEvents, sends, publisher } = makeHarness();

  void publisher
    .publish(makeEvent("e1"), "timed out", "send failed")
    .catch(() => {});
  await flush();
  assert.deepEqual(sends, ["e1"]);

  // Relay dropped the frame and sent a rate-limited NOTICE.
  setFakeNow(1_000);
  activateRateLimit(4);
  publisher.retryAfterRateLimit(() => true);

  tickTo(5_000);
  await flush();

  assert.deepEqual(sends, ["e1", "e1"]);
  assert.equal(pendingEvents.get("e1").rateLimitRetries, 1);
});

test("retry refreshes the publish timeout", async () => {
  reset();
  const { publisher } = makeHarness();

  let rejected = null;
  void publisher
    .publish(makeEvent("e1"), "publish timed out", "send failed")
    .catch((error) => {
      rejected = error;
    });
  await flush();

  setFakeNow(1_000);
  activateRateLimit(4);
  publisher.retryAfterRateLimit(() => true);
  tickTo(5_000);
  await flush();

  // Original timeout would have fired at PUBLISH_TIMEOUT_MS; the retry
  // rescheduled it to 5s + PUBLISH_TIMEOUT_MS.
  tickTo(PUBLISH_TIMEOUT_MS + 1_000);
  await flush();
  assert.equal(rejected, null);

  tickTo(5_000 + PUBLISH_TIMEOUT_MS);
  await flush();
  assert.match(rejected.message, /publish timed out/);
});

test("duplicate NOTICEs do not start concurrent retry passes", async () => {
  reset();
  const { sends, publisher } = makeHarness();

  void publisher
    .publish(makeEvent("e1"), "timed out", "send failed")
    .catch(() => {});
  await flush();

  setFakeNow(1_000);
  activateRateLimit(4);
  publisher.retryAfterRateLimit(() => true);
  publisher.retryAfterRateLimit(() => true);
  publisher.retryAfterRateLimit(() => true);

  tickTo(5_000);
  await flush();

  assert.deepEqual(sends, ["e1", "e1"]);
});

test("re-sends cap at MAX_PUBLISH_RATE_LIMIT_RETRIES", async () => {
  reset();
  const { pendingEvents, sends, publisher } = makeHarness();

  void publisher
    .publish(makeEvent("e1"), "timed out", "send failed")
    .catch(() => {});
  await flush();

  let now = 0;
  for (let cycle = 0; cycle < MAX_PUBLISH_RATE_LIMIT_RETRIES + 2; cycle++) {
    now += 1_000;
    setFakeNow(now);
    activateRateLimit(4);
    publisher.retryAfterRateLimit(() => true);
    now += 4_000;
    tickTo(now);
    await flush();
    // Keep the pending entry alive past its refreshed timeouts.
    const pending = pendingEvents.get("e1");
    assert.ok(pending);
  }

  // Initial send + at most MAX_PUBLISH_RATE_LIMIT_RETRIES re-sends.
  assert.equal(sends.length, 1 + MAX_PUBLISH_RATE_LIMIT_RETRIES);
  assert.equal(
    pendingEvents.get("e1").rateLimitRetries,
    MAX_PUBLISH_RATE_LIMIT_RETRIES,
  );
});

test("a stale connection generation prevents the re-send", async () => {
  reset();
  const { sends, publisher } = makeHarness();

  void publisher
    .publish(makeEvent("e1"), "timed out", "send failed")
    .catch(() => {});
  await flush();

  setFakeNow(1_000);
  activateRateLimit(4);
  publisher.retryAfterRateLimit(() => false);

  tickTo(5_000);
  await flush();

  assert.deepEqual(sends, ["e1"]);
});

test("already-resolved events are not re-sent", async () => {
  reset();
  const { pendingEvents, sends, publisher } = makeHarness();

  const eventA = makeEvent("a");
  const resultA = publisher.publish(eventA, "timed out", "send failed");
  void publisher
    .publish(makeEvent("b"), "timed out", "send failed")
    .catch(() => {});
  await flush();
  assert.deepEqual(sends, ["a", "b"]);

  // OK arrives for "a" before the gate clears.
  const pendingA = pendingEvents.get("a");
  window.clearTimeout(pendingA.timeout);
  pendingEvents.delete("a");
  pendingA.resolve(eventA);
  await resultA;

  setFakeNow(1_000);
  activateRateLimit(4);
  publisher.retryAfterRateLimit(() => true);
  tickTo(5_000);
  await flush();

  assert.deepEqual(sends, ["a", "b", "b"]);
});

test("retry with no pending events is a no-op", async () => {
  reset();
  const { sends, publisher } = makeHarness();

  activateRateLimit(4);
  publisher.retryAfterRateLimit(() => true);
  tickTo(4_000);
  await flush();

  assert.deepEqual(sends, []);
});

test("a later NOTICE after a completed pass starts a new retry pass", async () => {
  reset();
  const { sends, publisher } = makeHarness();

  void publisher
    .publish(makeEvent("e1"), "timed out", "send failed")
    .catch(() => {});
  await flush();

  setFakeNow(1_000);
  activateRateLimit(4);
  publisher.retryAfterRateLimit(() => true);
  tickTo(5_000);
  await flush();
  assert.deepEqual(sends, ["e1", "e1"]);

  setFakeNow(6_000);
  activateRateLimit(4);
  publisher.retryAfterRateLimit(() => true);
  tickTo(10_000);
  await flush();

  assert.deepEqual(sends, ["e1", "e1", "e1"]);
});
